import { useState, useEffect, useRef } from "react";
import { parseNumber, formatNumber } from "./parser";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from "recharts";
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const TAB_COLORS = {
  전체: "#8884d8",
  파밍: "#36a2eb",
  토너: "#ff6384",
  등반: "#4bc0c0",
  리롤: "#ffcd56",
};

const SHORT_NAMES = {
  orb: '오브',
  chainlightning: '체라',
  blackhole: '블홀',
  electrons: '전자',
  projectiles: '투사체',
  deathray: '죽광'
};

const IGNORE_LIST = [
  "damage taken","damage taken wall","damage taken while berserked",
  "damage gain from berserk","death defy","lifesteal","projectiles count",
  "enemies hit by orbs","land mines spawned","tagged by deathwave"
];

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState([]);
  const [savedList, setSavedList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTab, setActiveTab] = useState("배틀리포트");
  const [filterType, setFilterType] = useState("전체");
  const [modalVisible, setModalVisible] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => { loadSavedList(); }, []);

  const parseBattleDate = (raw) => {
    const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
    if (!match) return new Date(0);
    const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                     Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    const [, mon, day, year, time] = match;
    return new Date(`${year}-${months[mon]}-${day}T${time}:00`);
  };

  const formatBattleDate = (raw) => {
    const match = raw.match(/Battle Date\s+([A-Za-z]{3}) (\d{2}), (\d{4}) (\d{2}:\d{2})/);
    if (!match) return null;
    const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                     Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    const [, mon, day, year, time] = match;
    return `${year}-${months[mon]}-${day} ${time}`;
  };

  const extractTime = (line) => {
    let h=0,m=0,s=0;
    if (!line) return {h,m,s};
    const hMatch = line.match(/(\d+)h/), mMatch = line.match(/(\d+)m/), sMatch = line.match(/(\d+)s/);
    return {h:hMatch?+hMatch[1]:0, m:mMatch?+mMatch[1]:0, s:sMatch?+sMatch[1]:0};
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
    return `${h}h ${m}m ${s}s`;
  };

  const extractSummary = (raw) => {
    const tier = raw.match(/Tier\s+(\d+)/)?.[1]+"T" || "-";
    const waveNum = raw.match(/Wave\s+(\d+)/)?.[1] || "-";
    const wave = waveNum.replace(/\B(?=(\d{3})+(?!\d))/g,",")+"W";

    const timeLine = raw.split("\n").find(l => l.includes("Real Time"));
    const {h,m,s} = extractTime(timeLine);
    const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    const coinsLine = raw.split("\n").find(l=>l.includes("Coins earned"));
    const coins = coinsLine?.split("\t")[1]?.trim() || coinsLine?.split(":")[1]?.trim() || "0";
    const coinsFormatted = formatNumber(coins);
    const cph = raw.match(/Coins per hour\s+([\d.]+\w+)/)?.[1]+"/h" || "-";

    // 데미지 분석
    const lines = raw.split("\n");
    const totalDamageLine = lines.find(l=>l.toLowerCase().startsWith("damage dealt"));
    const totalDamage = totalDamageLine ? parseNumber(totalDamageLine.split("\t")[1]?.trim() || totalDamageLine.split(":")[1]?.trim()) : 0;

const damages = lines
  .filter(l => l.toLowerCase().includes("damage") && !l.toLowerCase().startsWith("damage dealt"))
  .map(l => {
    const nameRaw = (l.split("\t")[0] || l.split(":")[0]).trim();
    if (IGNORE_LIST.some(ig => nameRaw.toLowerCase().includes(ig))) return null;
    const num = parseNumber(l.split("\t")[1]?.trim() || l.split(":")[1]?.trim() || "0");
    const pct = totalDamage ? (num / totalDamage * 100) : 0;
    if (pct < 1) return null;
    const normalized = nameRaw.toLowerCase().replace(/\s+/g, '').replace('damage', '');
    return {name: SHORT_NAMES[normalized] || nameRaw, pct};
  })
  .filter(Boolean)
  .sort((a, b) => b.pct - a.pct)  // <-- 데미지 높은 순으로 정렬
  .map(d => `${d.name}: ${d.pct.toFixed(0)}%`);


return (
  <>
    <div>{tier} {wave} </div>
    <div>({coinsFormatted} / {timeStr}) ▶ {cph}</div>
{damages.length > 0 && (
  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {damages.map((d, i) => (
      <span key={i} style={{
        background: Object.values(TAB_COLORS)[i % Object.values(TAB_COLORS).length],
        color: '#fff',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 12,
        fontWeight: 600
      }}>
        {d}
      </span>
    ))}
  </div>
)}

  </>
);
  };

  const analyzeReport = (rawInput) => {
    const lines = rawInput.split("\n");
    const totalDamageLine = lines.find(l=>l.toLowerCase().startsWith("damage dealt"));
    const totalDamage = totalDamageLine ? parseNumber(totalDamageLine.split("\t")[1]?.trim() || totalDamageLine.split(":")[1]?.trim()) : 0;
    if (!totalDamage) return [{name:"총 대미지를 찾을 수 없음", percent:0}];

    const damages = lines
      .filter(l=>l.toLowerCase().includes("damage") && !l.toLowerCase().startsWith("damage dealt"))
      .map(l=>{
        const nameRaw = (l.split("\t")[0] || l.split(":")[0]).trim().toLowerCase();
        if (IGNORE_LIST.some(ig=>nameRaw.includes(ig))) return null;
        const num = parseNumber(l.split("\t")[1]?.trim() || l.split(":")[1]?.trim() || "0");
        const pct = (num/totalDamage)*100;
        if (pct<1) return null;
        return {name:nameRaw.charAt(0).toUpperCase()+nameRaw.slice(1), percent:pct};
      }).filter(Boolean)
      .sort((a,b)=>b.percent-a.percent);

    damages.push({name:"합계", percent: damages.reduce((acc,c)=>acc+c.percent,0)});
    return damages;
  };

const loadSavedList = async () => {
  const snap = await getDocs(collection(db, "reports"));
  const arr = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(item => {
      // Battle Date가 없으면 제외
      const battleDate = formatBattleDate(item.raw);
      if (!battleDate) return false;

      // 현재 날짜로부터 7일 전 날짜를 구함
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // 배틀리포트의 날짜가 1주일 이내인지 확인
      return new Date(battleDate.split(' ')[0]) >= oneWeekAgo;
    })
    .sort((a, b) => parseBattleDate(b.raw) - parseBattleDate(a.raw)); // 날짜 내림차순 정렬

  setSavedList(arr);
};


  const saveReport = async () => {
    if (!input.trim()) return alert("입력값이 없어!");
    if (savedList.some(r=>r.raw===input)) return alert("이미 등록됨!");
    await addDoc(collection(db,"reports"), {raw:input,timestamp:Date.now(),type:"전체"});
    setInput(""); loadSavedList();
  };

  const loadReport = (item) => { setSelectedReport(item); setResult(analyzeReport(item.raw)); setModalVisible(true); };
  const deleteReport = async (id) => { if(confirm("삭제?")){await deleteDoc(doc(db,"reports",id)); setModalVisible(false); loadSavedList();}};
  const changeReportType = async (id,type)=>{await updateDoc(doc(db,"reports",id),{type}); setSelectedReport(prev=>prev?{...prev,type}:null); loadSavedList();};
  const handleModalClick = (e)=>{ if(modalRef.current&&!modalRef.current.contains(e.target)){setModalVisible(false); setSelectedReport(null); setResult([]); }};

  const dailyStats = () => {
    const stats = {};
    savedList.forEach(item=>{
      const formatted = formatBattleDate(item.raw); if(!formatted) return;
      const date = formatted.split(" ")[0];
      const timeLine = item.raw.split("\n").find(l=>l.includes("Real Time"));
      const {h,m,s} = extractTime(timeLine);
      const seconds = h*3600 + m*60 + s;
      const coinsLine = item.raw.split("\n").find(l=>l.includes("Coins earned"));
      const coins = parseNumber(coinsLine?.split("\t")[1]?.trim() || coinsLine?.split(":")[1]?.trim() || "0");

      if(!stats[date]) stats[date] = {coins:0, seconds:0, realSeconds:0, typeSeconds:{파밍:0,토너:0,등반:0,리롤:0}};
      stats[date].coins+=coins; stats[date].seconds+=seconds; stats[date].realSeconds+=seconds;
      if(item.type && item.type!=="전체") stats[date].typeSeconds[item.type]+=seconds;
    });

    return Object.entries(stats).sort(([a],[b])=>new Date(b)-new Date(a));
  };

  return (
    <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
      <h1 style={{textAlign:"center",marginBottom:16}}>Battle Report</h1>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {['배틀리포트','날짜별 통계'].map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)} style={{flex:1,padding:10,borderRadius:8,border:'none',background:activeTab===t?'#0077b6':'#eee',color:activeTab===t?'white':'#333',fontWeight:600,cursor:'pointer'}}>{t}</button>
        ))}
      </div>

      {activeTab==='배틀리포트' && (
        <div>
          <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Battle Report 붙여넣기" style={{width:'100%',height:100,padding:10,borderRadius:10,border:'1px solid #ddd',fontSize:14,marginBottom:10}} />
          <div style={{display:'flex',gap:10,marginBottom:20}}>
            <button onClick={()=>setResult(analyzeReport(input))} style={{flex:1,padding:10,borderRadius:8}}>분석</button>
            <button onClick={saveReport} style={{flex:1,padding:10,borderRadius:8,background:'#4CAF50',color:'white',border:'none',fontWeight:700}}>저장</button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {Object.keys(TAB_COLORS).map(tab=>(
              <button key={tab} onClick={()=>setFilterType(tab)} style={{padding:'6px 12px',border:'none',borderRadius:6,background:filterType===tab?TAB_COLORS[tab]:TAB_COLORS[tab]+'55',color:'white',fontWeight:700,cursor:'pointer'}}>{tab}</button>
            ))}
          </div>

          <div style={{marginBottom:18}}>
            <h2 style={{marginBottom:8}}>저장된 리포트</h2>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {savedList.filter(r=>filterType==='전체'||r.type===filterType).map(item=>{
                const battleDate = formatBattleDate(item.raw) || "날짜 없음";
                const summary = extractSummary(item.raw);
                return (
                  <div key={item.id} onClick={()=>loadReport(item)} style={{padding:12,borderRadius:10,background:TAB_COLORS[item.type]+'22',cursor:'pointer'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontWeight:700}}>{battleDate}</div>
                      <div style={{fontSize:12,color:'#555'}}>{item.type}</div>
                    </div>
                    <div style={{marginTop:6,color:'#444'}}>{summary}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab==='날짜별 통계' && (
        <div style={{marginTop:20}}>
          <h2>날짜별 통계 (24시간 기준)</h2>
          {dailyStats().map(([date, stat])=>{
            const totalSecByType = Object.values(stat.typeSeconds).reduce((a,b)=>a+b,0);
            const usedSec = totalSecByType>0?totalSecByType:stat.seconds;
            const fullPercent = isNaN(usedSec/86400*100)?0:(usedSec/86400*100);
            const typePercents = Object.fromEntries(Object.entries(stat.typeSeconds).map(([k,v])=>[k,(v/86400*100).toFixed(2)]));
            const wastePercent = Math.max(0,100-fullPercent).toFixed(2);

            return (
              <div key={date} style={{padding:14,marginBottom:14,borderRadius:10,background:'#f7f7f7',boxShadow:'0 2px 6px rgba(0,0,0,0.08)'}}>
                <div style={{fontWeight:700,fontSize:16}}>{date}</div>
                <div style={{marginTop:6}}>Coins: <b>{formatNumber(stat.coins)}</b></div>
                <div>Real Time: <b>{formatTime(stat.realSeconds)}</b></div>
                <div style={{marginTop:6}}>
                  <ResponsiveContainer width="100%" height={20}>
                    <BarChart data={[{name:'전체', value: fullPercent}]} layout="vertical" margin={{top:0,right:0,bottom:0,left:0}}>
                      <XAxis type="number" domain={[0,100]} hide/>
                      <YAxis type="category" dataKey="name" hide/>
                      <Bar dataKey="value" fill="#0077b6" isAnimationActive={false} background={{fill:"#ddd"}}>
                        <LabelList dataKey="value" position="insideRight" formatter={v=>v.toFixed(2)+'%'} fill="#fff" fontSize={12} fontWeight={600} offset={5}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginTop:8}}>
                  {Object.entries(typePercents).map(([k,v])=><div key={k}>{k}: <b>{v}%</b></div>)}
                </div>
                <div style={{marginTop:8}}>낭비 시간: <b>{wastePercent}%</b></div>
              </div>
            );
          })}
        </div>
      )}

      {modalVisible && selectedReport && (
        <div onClick={handleModalClick} style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}>
          <div ref={modalRef} style={{background:'white',padding:20,borderRadius:10,width:'80%',maxHeight:'80%',overflowY:'auto'}}>
            <h2>전투 리포트</h2>
            <textarea value={selectedReport.raw} readOnly style={{width:'100%',height:150,marginTop:10}}/>
            {result.length>0 && result[0].name!=="총 대미지를 찾을 수 없음" && (
              <div style={{marginTop:20}}>
                <h3>데미지 비율</h3>
                <div style={{height:250}}>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={result.filter(d=>d.name!=='합계')} dataKey='percent' nameKey='name' outerRadius={100} label={false}>
                        {result.filter(d=>d.name!=='합계').map((entry,i)=><Cell key={i} fill={TAB_COLORS[Object.keys(TAB_COLORS)[i%Object.keys(TAB_COLORS).length]]}/>)}
                      </Pie>
                      <Tooltip formatter={v=>v.toFixed(2)+'%'}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{marginTop:10}}>
                  {result.filter(r=>r.name!=='합계').map((item,i)=><div key={i}><b>{item.name}:</b> {item.percent.toFixed(2)}%</div>)}
                  <div style={{marginTop:6,fontWeight:700}}>합계: {result[result.length-1].percent.toFixed(2)}%</div>
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:10,marginTop:10}}>
              <select value={selectedReport.type} onChange={e=>changeReportType(selectedReport.id,e.target.value)} style={{padding:8,borderRadius:6}}>
                {Object.keys(TAB_COLORS).map(tab=><option key={tab} value={tab}>{tab}</option>)}
              </select>
              <button onClick={()=>deleteReport(selectedReport.id)} style={{padding:'8px 12px',background:'#ff4444',color:'white',border:'none',borderRadius:6,fontWeight:700}}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
