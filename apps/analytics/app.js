const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=(v,precision='second')=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Macau',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:precision==='second'?'2-digit':undefined,hour12:false}):'未提供';
const n=v=>typeof v==='number'?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v):'—';
let state=null,etag=null,busy=false;
let selected=null,compareMetric="views",historyId=null,historyMetric="views",seenContentIds=new Set();
function empty(title,body){return `<div class="empty"><span class="empty-icon">▥</span><h3>${esc(title)}</h3><p class="muted">${esc(body)}</p></div>`;}
function render(s){
 $('#updated').textContent='最近读取 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
 $('#banner').innerHTML=s.status==='READY'?'':`<div class="banner ${s.status==='SOURCE_ERROR'?'error':''}"><span class="banner-symbol">${s.status==='SOURCE_ERROR'?'!':'◷'}</span><div><strong>${s.status==='SOURCE_ERROR'?'数据暂不可用':'等待共享数据'}</strong><p>${esc(s.reason)}${s.retained_last_valid?'；当前保留上次有效值（STALE），不是最新采集。':''}</p></div></div>`;
 renderInventory(s);
 const a=s.aggregates;
 $('#stats').innerHTML=`<div class="stat"><div class="stat-label">已接入作品</div><div class="stat-value">${s.status==='WAITING_FOR_DATA'||s.status==='SOURCE_ERROR'?'—':a.contents_count}</div><div class="stat-foot">${a.with_snapshots} 件有可用采集记录 · ${s.snapshots.length} 次历史快照</div></div><div class="stat"><div class="stat-label">已知观看合计</div><div class="stat-value">${n(a.metrics.views.known_sum)}</div><div class="stat-foot">覆盖 ${a.metrics.views.known_contents} / ${a.contents_count} 件作品，按各自最新记录</div></div><div class="stat"><div class="stat-label">已知收藏合计</div><div class="stat-value">${n(a.metrics.favorites.known_sum)}</div><div class="stat-foot">覆盖 ${a.metrics.favorites.known_contents} / ${a.contents_count} 件作品</div></div><div class="stat"><div class="stat-label">最近成功采集</div><div class="stat-value word">${a.latest_collected_at?esc(date(a.latest_collected_at)):'尚无记录'}</div><div class="stat-foot">澳门时间 · 每3秒读取已有文件</div></div>`;
 $('#stats').insertAdjacentHTML('beforeend',(a.summary_cards||[]).map(c=>`<div class="stat stat-highlight" data-summary="${c.key}"><div class="stat-label">${esc(c.label)}</div><div class="stat-value ${c.value===null?'word':''}">${c.value===null?'暂无可核验数据':n(c.value)}</div><div class="stat-foot">覆盖 ${c.known_contents} / ${c.total_contents} 件作品${c.quality==='PARTIAL'?' · 部分已知':''}</div><p class="stat-note">${esc(c.note)}</p>${c.missing_content_ids.length?`<details><summary>缺失作品（${c.missing_content_ids.length}）</summary><p class="stat-note">${c.missing_content_ids.map(esc).join('、')}</p></details>`:''}</div>`).join(''));
 $('#count').textContent=s.contents.length?s.contents.length+' 件作品':'尚无可用作品';
 $('#contents').classList.toggle('has-data',s.contents.length>0);
 $('#contents').innerHTML=s.contents.length?renderCards(s):empty('还没有可展示的作品数据','共享数据就绪后，这里会显示每件作品的官方指标、发布时间、采集时间和缺失原因。');
 if(s.contents.length){renderAnalysis(s);return;}
 $('#analysis').innerHTML=`<div class="placeholder-sections"><section id="comparison" class="panel"><h2>作品对比</h2>${empty('等待可对比的采集记录','每件作品保留各自采集时间，不将缺失指标当作零。')}</section><section id="history" class="panel"><h2>历史趋势</h2>${empty('等待历史快照','只绘制真实采集点；单个点不构造趋势，缺失值不连线。')}</section></div>`;
}
async function refresh(){if(busy)return;busy=true;$('#refresh').disabled=true;try{const r=await fetch('/api/v1/analytics',{cache:'no-store',headers:etag?{'If-None-Match':etag}:{}});if(r.status===304){$('#updated').textContent='数据未变 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false});return;}if(!r.ok)throw new Error('读取失败，请重试');state=await r.json();etag=r.headers.get('etag');render(state);}catch(e){$('#banner').innerHTML=`<div class="banner error" role="alert">${esc(e.message)}${state?'，当前保留上次结果。':''}</div>`;}finally{busy=false;$('#refresh').disabled=false;}}
$('#refresh').addEventListener('click',refresh);


const missingLabels={page_dash:'页面为横杠，原因未说明',below_100_views:'观看不足 100，暂无法分析',insufficient_data:'数据量不足',not_visible:'页面未显示',no_readable_chart_values:'页面无可读取图表值',page_dash_label_inferred_from_same_layout:'页面横杠；字段名参考同版式'};
function reason(code){return missingLabels[code]||code||'未提供';}
function metricText(m,key){if(!m||m.value===null)return '—';return n(m.value)+(key==='cover_ctr'?'%':key==='average_view_duration'?'秒':'');}
function observed(s){return s?date(s.collected_at)+(s.observed_at_precision==='approximate_minute'?'（约，分钟精度）':''):'尚无记录';}
function renderCards(s){return `<div class="content-cards">${s.contents.map(c=>{const v=c.latest;return `<article class="panel content-card" data-content="${esc(c.id)}"><div class="content-top"><span class="content-id">${esc(c.id)}</span><span class="coverage">完整度 ${v?v.completeness.known+'/10':'—'} <progress max="10" value="${v?.completeness.known||0}" aria-label="${esc(c.id)} 核心指标完整度"></progress> ${v?n(v.completeness.percent)+'%':''}</span></div><h3 class="content-title">${esc(c.title)}</h3><div class="time-meta"><span>发布 ${esc(date(c.published_at,c.published_at_precision))}</span><span>采集 ${esc(observed(v))}</span></div><div class="metric-grid">${s.metric_definitions.map(m=>`<div class="metric" data-metric="${m.key}"><span>${esc(m.label)}</span><strong>${metricText(c.latest_known_metrics?.[m.key]||v?.metrics[m.key],m.key)}</strong>${c.latest_known_metrics?.[m.key]?.carried_forward?`<small>沿用历史 · ${esc(date(c.latest_known_metrics[m.key].observed_at))}</small>`:''}${v?.metrics[m.key].value===null?`<small>${esc(reason(v.metrics[m.key].missing_reason))}</small>`:''}</div>`).join('')}</div><div class="card-bottom"><div class="rate">互动率<strong>${v?.derived.engagement_rate.value!=null?n(v.derived.engagement_rate.value)+'%':'不可计算'}</strong><span class="hint">${esc(v?.derived.engagement_rate.reason||'(赞 + 藏 + 评 + 分享) ÷ 观看')}</span></div><button class="text-button" data-history="${esc(c.id)}">查看 ${c.snapshot_count} 次采集</button></div><p class="reason">完整度按本轮10项统计；沿用历史值单独标时，不作为本轮完整快照。</p>${cardDetails(c,s)}</article>`;}).join('')}</div>`;}



const extraLabels={note_status:'作品状态',diagnosis:'作品诊断',view_sources:'观看来源',audience_profile:'观众画像',trend_analysis:'平台趋势分析',basic_updated_through:'基础数据更新至',views_update_policy:'观看更新口径',interaction_update_policy:'互动更新口径',impressions_fan_share:'曝光中粉丝占比',views_fan_share:'观看中粉丝占比',cover_ctr_fans:'粉丝封面点击率',average_view_duration_fans:'粉丝人均观看时长',likes_fan_share:'点赞中粉丝占比',comments_fan_share:'评论中粉丝占比',favorites_fan_share:'收藏中粉丝占比',shares_fan_share:'分享中粉丝占比'};
function renderInventory(s){
 const r=s.latest_inventory_reconciliation;
 $('#inventory').innerHTML=r?`<section class="panel inventory-panel" aria-label="全作品核对"><div class="section-head"><div><h2>全作品核对</h2><p class="muted">最近核对 ${esc(date(r.observed_at))}</p></div><span class="label">${r.all_pages_visited?'全部分页已遍历':'分页尚未核对完整'}</span></div><div class="inventory-facts"><span>平台作品总数 <strong>${r.manager_total}</strong></span><span>已发布 <strong>${r.published_count}</strong></span><span>数据列表 <strong>${r.analytics_total}</strong></span><span>已遍历 ${new Set(r.pages_visited).size} / ${r.analytics_page_count} 页</span><span>新发现 <strong>${esc(r.new_content_ids.join('、')||'无')}</strong></span></div><p class="meta-note">${esc(r.coverage_basis)}</p>${r.conflicts.map(c=>typeof c.detail==='string'?`<div class="threshold"><strong>核对时发现数据差异</strong><p>${esc(c.detail)}</p></div>`:`<div class="threshold"><strong>核对时发现状态冲突 · ${esc(c.content_id)}</strong><p>中央记录：${esc(c.central_status)}；平台记录：${esc(c.platform_status)}。${esc(c.resolution)}</p></div>`).join('')}<p class="meta-note">${r.source_urls.map(url=>sourceLink({url},'官方核对来源')).join(' · ')} · 核对记录不自动修改中央状态。</p></section>`:`<p class="meta-note">尚无全作品核对记录；不根据已接入作品数推断平台总数。</p>`;
}
function sourceLink(source,label='官方来源'){return source?.url?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'来源未提供';}
function valueText(value){return value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);}
function cardDetails(c,s){const v=c.latest;if(!v)return '';
 const extra=Object.entries(v.additional_fields);
 return `<details class="card-details" id="details-${c.id}"><summary>原始值、缺失原因与来源</summary><p class="meta-note">采集 ${esc(observed(v))}。采集时间不等于全部字段的统计截止时间；请同时查看下方更新口径。</p><div class="raw-grid">${s.metric_definitions.map(m=>{const field=v.metrics[m.key];return `<article><strong>${esc(m.label)}</strong><p>官方原值：${esc(field.raw??'未显示')}</p><small>${field.value===null?esc(reason(field.missing_reason)):'页面明确数值'}</small><br>${sourceLink({url:field.source_url})}</article>`;}).join('')}</div><div class="extended-list">${extra.map(([key,f])=>`<div><strong>${esc(extraLabels[key]||f.label||key)}</strong><span>${esc(f.raw??valueText(f.value))}</span>${f.value===null?`<p>${esc(reason(f.missing_reason))}</p>`:''}${sourceLink({url:f.source_url},'查看依据')}</div>`).join('')}</div><dl class="source-list"><div><dt>作品 noteId</dt><dd>${esc(c.note_id||'NOTE_ID_PENDING · 待后续补全')}</dd></div><div><dt>当前采集来源</dt><dd>${sourceLink(v.source)} · ${sourceLink(c.source,'作品分析详情')}</dd></div><div><dt>采集筛选范围</dt><dd>${esc(JSON.stringify(v.filters))}</dd></div><div><dt>质量标记</dt><dd>${esc(v.quality_flags.join('、')||'无额外标记')}</dd></div>${v.source.path?`<div><dt>本机历史证据路径（仅内部）</dt><dd>${esc(v.source.path)}</dd></div>`:''}</dl></details>`;
}
function measure(snapshot,key){return key==='engagement_rate'?snapshot?.derived.engagement_rate.value??null:snapshot?.metrics[key]?.value??null;}
function measurementReason(snapshot,key){return key==='engagement_rate'?snapshot?.derived.engagement_rate.reason:reason(snapshot?.metrics[key]?.missing_reason);}
function label(key){return key==='engagement_rate'?'互动率':state.metric_definitions.find(m=>m.key===key)?.label||key;}
function unit(key){return key==='engagement_rate'?'%':state.metric_definitions.find(m=>m.key===key)?.unit||'';}
function shown(value,key){return value===null?'不可计算 / 缺失':n(value)+(unit(key)==='%'?'%':unit(key)==='秒'?'秒':'');}
function options(current){return [...state.metric_definitions,{key:'engagement_rate',label:'互动率（派生）'}].map(m=>`<option value="${m.key}" ${m.key===current?'selected':''}>${esc(m.label)}</option>`).join('');}
function renderAnalysis(s){
 if(selected===null)selected=new Set(s.contents.map(c=>c.id));
 for(const c of s.contents){if(!seenContentIds.has(c.id))selected.add(c.id);}
 seenContentIds=new Set(s.contents.map(c=>c.id));
 selected=new Set([...selected].filter(id=>s.contents.some(c=>c.id===id)));
 if(!s.contents.some(c=>c.id===historyId))historyId=s.contents.at(-1)?.id;
 const activeId=document.activeElement?.id;
 const openIds=[...document.querySelectorAll('#analysis details[open]')].map(el=>el.id);
 const choices=s.contents.filter(c=>selected.has(c.id));
 const maximum=Math.max(1,...choices.map(c=>measure(c.latest,compareMetric)).filter(v=>v!==null));
 const c=s.contents.find(c=>c.id===historyId);
 $('#analysis').innerHTML=`<section id="comparison" class="panel analysis-section"><div class="section-head"><div><p class="eyebrow">SIDE BY SIDE</p><h2>作品对比</h2><p class="muted">比较各作品最新快照，保留采集时间与发布时长。</p></div><label class="control" for="compare-metric">对比指标<select id="compare-metric">${options(compareMetric)}</select></label></div><div class="selection" role="group" aria-label="选择对比作品">${s.contents.map(c=>`<label class="select-content"><input id="compare-${c.id}" type="checkbox" data-compare="${c.id}" ${selected.has(c.id)?'checked':''}>${esc(c.id)}</label>`).join('')}</div>${choices.length?`<div class="compare-grid">${choices.map(c=>{const value=measure(c.latest,compareMetric);return `<article class="compare-item" data-compare-content="${c.id}"><span class="content-id">${esc(c.id)}</span><h3>${esc(c.title)}</h3><div class="compare-value">${shown(value,compareMetric)}<span class="hint">${esc(label(compareMetric))}${unit(compareMetric)==='%'||unit(compareMetric)==='秒'?'':' · '+unit(compareMetric)}</span></div>${value===null?`<p class="reason">${esc(measurementReason(c.latest,compareMetric))}</p>`:`<meter min="0" max="${maximum}" value="${value}" aria-label="${c.id} ${esc(label(compareMetric))}"></meter>`}<div class="compare-meta">采集 ${esc(observed(c.latest))}<br>发布后 ${c.publication_age_hours===null?'未知':n(c.publication_age_hours)+' 小时'}</div></article>`;}).join('')}</div>`:empty('请选择作品','勾选上方作品，查看同一指标的对比。')}<p class="meta-note">不同发布时间、数据量和统计截止时间会影响可比性；这里不自动判定哪篇内容更好。</p>${compareMetric==='engagement_rate'?formula():''}</section>
 <section id="history" class="panel analysis-section"><div class="section-head"><div><p class="eyebrow">OBSERVATION HISTORY</p><h2>单作品历史趋势</h2><p class="muted">按真实采集时间绘制，保留每一个历史记录。</p></div><span class="label">${c.history.length} 次采集</span></div><div class="controls"><label class="control" for="history-content">选择作品<select id="history-content">${s.contents.map(item=>`<option value="${item.id}" ${item.id===historyId?'selected':''}>${esc(item.id+' · '+item.title)}</option>`).join('')}</select></label><label class="control" for="history-metric">趋势指标<select id="history-metric">${options(historyMetric)}</select></label></div>${chart(c,historyMetric)}<p class="chart-caption">本站仅连接相邻有值的采集点，缺失处断开；这是采集快照变化，不是平台提供的日趋势图。</p>${historyMetric==='engagement_rate'?formula():''}<details id="history-records" class="history-list" open><summary>查看每次采集的原值与依据</summary><div class="history-rows">${c.history.map(v=>`<article class="history-row"><div><time>${esc(observed(v))}</time><small>发布后 ${n(v.elapsed_seconds/3600)} 小时${v.observed_at_precision==='approximate_minute'?'（约）':''} · ${sourceLink(v.source)}</small></div><div><strong>${shown(measure(v,historyMetric),historyMetric)}</strong><small>${measure(v,historyMetric)===null?esc(measurementReason(v,historyMetric)):'原值 '+esc(historyMetric==='engagement_rate'?'派生计算':v.metrics[historyMetric]?.raw??'未显示')}</small></div></article>`).join('')}</div></details>${c.latest?.additional_fields.diagnosis?.value===null?`<div class="threshold"><strong>平台分析可用性</strong><p>${esc(c.latest.additional_fields.diagnosis.raw||reason(c.latest.additional_fields.diagnosis.missing_reason))}。以上历史图仍只使用已取得的基础指标快照。</p></div>`:''}</section>
 <div class="contract-note"><span>共享数据更新：${esc(date(s.source_updated_at))} · 版本 ${esc(s.version.slice(0,10))}</span><span>核心完整度基于 10 项官方指标；公开投影尚未启用。</span></div>`;
 for(const id of openIds){const el=document.getElementById(id);if(el)el.open=true;}
 if(activeId)document.getElementById(activeId)?.focus({preventScroll:true});
}
function formula(){return `<div class="formula"><strong>互动率 =（点赞 + 收藏 + 评论 + 分享）÷ 观看 × 100%</strong><p>任何一项缺失，或观看为 0 时，均不可计算。按互动次数统计，不是独立用户占比，可能超过 100%；原始字段可能存在不同更新口径。</p></div>`;}
function chart(c,key){
 const points=c.history.map(v=>({snapshot:v,x:Date.parse(v.collected_at),y:measure(v,key)}));
 const valid=points.filter(p=>p.y!==null);
 if(!valid.length)return empty('该指标暂无可绘制数值','缺失原因保留在下方采集记录中，不会把缺失值绘制为零。');
 const width=900,height=280,left=62,right=26,top=26,bottom=43;
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
 const maxY=Math.max(1,...valid.map(p=>p.y))*1.12;
 const sx=x=>minX===maxX?width/2:left+(x-minX)/(maxX-minX)*(width-left-right);
 const sy=y=>height-bottom-y/maxY*(height-top-bottom);
 let d='',pen=false;
 for(const p of points){if(p.y===null){pen=false;continue;}d+=(pen?' L ':' M ')+sx(p.x).toFixed(2)+' '+sy(p.y).toFixed(2);pen=true;}
 const ticks=[0,maxY/2,maxY];
 return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(c.id+' '+label(key)+' 历史趋势，共 '+valid.length+' 个有效采集点')}" xmlns="http://www.w3.org/2000/svg"><title>${esc(c.title+' '+label(key))}</title>${ticks.map(y=>`<line class="grid-line" x1="${left}" y1="${sy(y)}" x2="${width-right}" y2="${sy(y)}"/><text x="${left-10}" y="${sy(y)+5}" text-anchor="end">${n(y)}</text>`).join('')}<path class="trend-line" d="${d}"/>${valid.map(p=>`<circle class="data-point" cx="${sx(p.x)}" cy="${sy(p.y)}" r="5" tabindex="0" aria-label="${esc(observed(p.snapshot)+'，'+shown(p.y,key))}"><title>${esc(observed(p.snapshot)+'：'+shown(p.y,key))}</title></circle>`).join('')}<text x="${left}" y="${height-10}">${esc(date(new Date(minX).toISOString()).slice(5,16))}</text>${minX!==maxX?`<text x="${width-right}" y="${height-10}" text-anchor="end">${esc(date(new Date(maxX).toISOString()).slice(5,16))}</text>`:''}</svg></div>`;
}
$('#analysis').addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.compare){if(el.checked)selected.add(el.dataset.compare);else selected.delete(el.dataset.compare);}
 else if(el.id==='compare-metric')compareMetric=el.value;
 else if(el.id==='history-content')historyId=el.value;
 else if(el.id==='history-metric')historyMetric=el.value;
 else return;
 renderAnalysis(state);
});
$('#contents').addEventListener('click',event=>{const el=event.target.closest('[data-history]');if(!el)return;historyId=el.dataset.history;renderAnalysis(state);$('#history').scrollIntoView({behavior:'smooth'});});
function registerTools(){
 const context=document.modelContext;if(!context?.registerTool)return;
 const lifecycle=new AbortController();
 const register=t=>{try{Promise.resolve(context.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_content_analytics',title:'读取作品指标',description:'读取本机共享数据派生的全部作品指标、缺失原因、来源和历史，只读。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},async execute(input){if(!input||Object.keys(input).length)throw new Error('不接受参数');const r=await fetch('/api/v1/analytics');if(!r.ok)throw new Error('数据暂不可用');return r.json();}});
 register({name:'show_content_history',title:'查看作品趋势',description:'仅切换当前页面的作品和趋势指标，不写入数据或触发平台采集。',inputSchema:{type:'object',properties:{content_id:{type:'string'},metric:{type:'string'}},required:['content_id','metric'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||Object.keys(input).some(k=>!['content_id','metric'].includes(k))||!state?.contents.some(c=>c.id===input.content_id)||![...state.metric_definitions.map(m=>m.key),'engagement_rate'].includes(input.metric))throw new Error('作品或指标无效');historyId=input.content_id;historyMetric=input.metric;renderAnalysis(state);$('#history').scrollIntoView();return {content_id:historyId,metric:historyMetric,updated_view:true};}});
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
await refresh();registerTools();setInterval(()=>{if(!document.hidden)refresh();},3000);

window.addEventListener('collection-committed',()=>{etag=null;refresh();});
