import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Activity, Award, Home, Languages, PlaneTakeoff, RotateCcw, Ruler, Target, Timer, Wind, ZoomIn, ZoomOut } from 'lucide-react';

type Mode = 'distance' | 'airtime' | 'precision';
type Lang = 'zh' | 'en' | 'both';
type FlightStatus = 'ready' | 'flying' | 'landed';
type Params = { wingArea: number; centerOfGravity: number; foldAngle: number; winglets: boolean; throwPower: number; launchAngle: number; launchDirection: number; windSpeed: number; windDirection: number };
type TargetPoint = { distance: number; offset: number };
type Result = { distance: number; airTime: number; stability: number; lift: number; drag: number; accuracy: number; totalScore: number; grade: 'S' | 'A' | 'B' | 'C' | 'D'; landingX: number; landingZ: number; targetX: number; targetZ: number; stallRisk: number; coach: string[]; analysis: string };

const defaultParams: Params = { wingArea: 58, centerOfGravity: 48, foldAngle: 38, winglets: true, throwPower: 72, launchAngle: 27, launchDirection: 0, windSpeed: 0, windDirection: 0 };
const storageKey = 'aerofold-best-records';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

const zh = (codes: string) => codes.split(' ').map((code) => String.fromCharCode(parseInt(code, 16))).join('');
const pair = (cn: string, en: string): [string, string] => [zh(cn), en];
const L = (lang: Lang, text: [string, string]) => (lang === 'zh' ? text[0] : lang === 'en' ? text[1] : `${text[0]} / ${text[1]}`);

const copy = {
  subtitle: pair('7eb8 98de 673a 5de5 7a0b 5e08 822a 7a7a 6559 80b2 6c99 76d2', 'Paper Airplane Engineer aviation sandbox'),
  controls: pair('673a 4f53 53c2 6570', 'Airframe Controls'),
  controlsSub: pair('8c03 6574 6298 53e0 3001 91cd 5fc3 548c 53d1 5c04 59ff 6001', 'Tune folds, force, and launch attitude'),
  environment: pair('73af 5883 53c2 6570', 'Environment Controls'),
  windSpeed: pair('98ce 901f', 'Wind Speed'),
  windDirection: pair('98ce 5411', 'Wind Direction'),
  simulator: pair('33 44 20 98de 884c 5b9e 9a8c 573a', '3D Flight Simulator'),
  simulatorSub: pair('5b9e 65f6 673a 4f53 9884 89c8 3001 7a7a 95f4 822a 8ff9 548c 76ee 6807 533a', 'Live preview, spatial flight path, and target area'),
  model: pair('7eb8 98de 673a 6a21 578b 9884 89c8', 'Paper Airplane Model'),
  launch: pair('53d1 5c04', 'Launch'),
  resetFlight: pair('91cd 7f6e 98de 884c', 'Reset Flight'),
  telemetry: pair('9065 6d4b 7ed3 679c', 'Telemetry'),
  score: pair('603b 5206', 'Total Score'),
  records: pair('6700 4f73 8bb0 5f55', 'Best Record'),
  coach: pair('41 49 20 98de 884c 6559 7ec3', 'AI Flight Coach'),
  report: pair('98de 884c 6d4b 8bd5 62a5 544a', 'Flight Test Report'),
  next: pair('4e0b 4e00 6b65 5efa 8bae', 'Suggested next change'),
  language: pair('8bed 8a00', 'Language'),
  targetDistance: pair('76ee 6807 8ddd 79bb', 'Target distance'),
  targetHint: pair('53f3 952e 62d6 52a8 76ee 6807 70b9', 'Right-drag target'),
  predicted: pair('9884 6d4b 822a 8ff9', 'Predicted path'),
};

const modeNames: Record<Mode, [string, string]> = {
  distance: pair('8ddd 79bb 6311 6218', 'Distance Challenge'),
  airtime: pair('6ede 7a7a 6311 6218', 'Air Time Challenge'),
  precision: pair('7cbe 51c6 964d 843d', 'Precision Landing'),
};

function readRecords(): Record<Mode, number> {
  try {
    return { distance: 0, airtime: 0, precision: 0, ...JSON.parse(localStorage.getItem(storageKey) || '{}') };
  } catch {
    return { distance: 0, airtime: 0, precision: 0 };
  }
}

function coachFlight(params: Params, metrics: Pick<Result, 'drag' | 'stability' | 'accuracy' | 'stallRisk'>, mode: Mode, lang: Lang) {
  const tips: [string, string][] = [];
  if (params.wingArea < 42) tips.push(pair('589e 5927 7ffc 9762 79ef ff0c 5148 83b7 5f97 8db3 591f 5347 529b 3002', 'Increase wing area to generate more lift first.'));
  if (params.wingArea > 78) tips.push(pair('7ffc 9762 504f 5927 ff0c 53ef 7565 5fae 51cf 5c0f 7ffc 9762 79ef 964d 963b 3002', 'Large wings lift well; trim area slightly if drag limits range.'));
  if (Math.abs(params.centerOfGravity - 48) > 16) tips.push(pair('5c06 91cd 5fc3 79fb 8fd1 20 34 38 25 ff0c 53ef 63d0 9ad8 7a33 5b9a 6027 3002', 'Move CG closer to 48% chord for steadier glide.'));
  if (params.foldAngle > 52) tips.push(pair('51cf 5c0f 6298 53e0 89d2 ff0c 907f 514d 963b 529b 548c 5931 901f 98ce 9669 3002', 'Reduce fold angle to avoid drag buildup and stall risk.'));
  if (!params.winglets && metrics.stability < 74) tips.push(pair('5f00 542f 7ffc 68a2 5c0f 7ffc ff0c 6291 5236 6eda 8f6c ff0c 63d0 9ad8 7a33 5b9a 6027 3002', 'Enable winglets to damp roll and improve tracking.'));
  if (params.launchAngle > 34) tips.push(pair('964d 4f4e 53d1 5c04 89d2 ff0c 5f53 524d 62ac 5934 8fc7 591a 3002', 'Lower launch angle; the throw is wasting energy climbing.'));
  if (params.launchAngle < 18) tips.push(pair('63d0 9ad8 53d1 5c04 89d2 ff0c 628a 901f 5ea6 8f6c 6210 66f4 591a 6ede 7a7a 3002', 'Raise launch angle to convert speed into more air time.'));
  if (params.throwPower < 52) tips.push(pair('673a 4f53 7a33 5b9a 540e 589e 52a0 6295 63b7 529b 91cf 3002', 'Use more throw power once the airframe is stable.'));
  if (metrics.drag > 70) tips.push(pair('963b 529b 504f 9ad8 ff0c 5148 964d 4f4e 6298 89d2 6216 7ffc 9762 79ef 3002', 'Drag is high. Reduce fold angle or wing area first.'));
  if (metrics.stallRisk > 45) tips.push(pair('5931 901f 98ce 9669 5347 9ad8 ff0c 91c7 7528 66f4 6d45 7684 53d1 5c04 89d2 3002', 'Stall risk is elevated. Favor a shallower launch.'));
  if (mode === 'precision' && metrics.accuracy < 80) tips.push(pair('7cbe 51c6 964d 843d 65f6 ff0c 62d6 52a8 76ee 6807 5e76 5c0f 6b65 8c03 6574 529b 91cf 3002', 'For precision, drag the target and tune power in small steps.'));
  if (tips.length === 0) tips.push(pair('914d 5e73 5f88 597d ff0c 53ef 5fae 8c03 91cd 5fc3 51b2 51fb 20 53 20 7ea7 8bb0 5f55 3002', 'Excellent balance. Try tiny CG changes for an S-grade record.'));
  return tips.slice(0, 4).map((tip) => L(lang, tip));
}

function simulate(params: Params, mode: Mode, lang: Lang, targetPoint: TargetPoint): Result {
  const wing = params.wingArea / 100;
  const power = params.throwPower / 100;
  const angle = params.launchAngle / 45;
  const fold = params.foldAngle / 70;
  const cgOffset = Math.abs(params.centerOfGravity - 48) / 48;
  const sweetLaunch = 1 - Math.abs(params.launchAngle - 26) / 35;
  const windSpeedNorm = params.windSpeed / 100;
  const windDirRad = THREE.MathUtils.degToRad(params.windDirection);
  
  const lift = clamp(38 + wing * 42 + sweetLaunch * 16 - Math.max(0, fold - 0.68) * 16, 0, 100);
  const drag = clamp(18 + wing * 22 + fold * 34 + (params.winglets ? 6 : 0), 0, 100);
  const stability = clamp(98 - cgOffset * 95 - Math.max(0, params.foldAngle - 48) * 1.15 + (params.winglets ? 13 : -8), 0, 100);
  const stallRisk = clamp((params.launchAngle - 31) * 2.2 + (params.foldAngle - 48) * 1.1 - stability * 0.18, 0, 100);
  const efficiency = clamp(lift * 0.74 + stability * 0.38 - drag * 0.45 - stallRisk * 0.34, 8, 100);
  
  // 风对飞行的影响
  const windX = Math.cos(windDirRad) * windSpeedNorm;
  const windZ = Math.sin(windDirRad) * windSpeedNorm;
  
  const distance = clamp(power * 72 + angle * 19 + efficiency * 0.82 - drag * 0.18 + windX * 25, 8, 112);
  const airTime = clamp(0.65 + wing * 2.4 + angle * 1.8 + stability * 0.018 - drag * 0.012 - stallRisk * 0.018 + windX * 0.8, 0.7, 6.2);
  
  const targetX = mode === 'precision' ? targetPoint.distance : mode === 'distance' ? 92 : 72;
  const targetZ = mode === 'precision' ? targetPoint.offset : -2.2;
  const landingX = clamp(distance, 8, 112);
  const landingZ = clamp(-2.2 + Math.tan(THREE.MathUtils.degToRad(params.launchDirection)) * (distance / 9.5) + windZ * 15, -7.8, 7.8);
  const missDistance = Math.hypot(landingX - targetX, (landingZ - targetZ) * 8);
  const accuracy = clamp(100 - missDistance * 2.15 - Math.abs(params.launchAngle - 24) * 0.5, 0, 100);
  const rawScore = mode === 'distance'
    ? (distance / 112) * 85 + (stability / 100) * 15 // 距离挑战：距离权重85%，稳定性15%
    : mode === 'airtime'
      ? (airTime / 6.2) * 85 + (stability / 100) * 15 // 滞空挑战：时间权重85%，稳定性15%
      : accuracy * 0.7 + stability * 0.18 + distance * 0.08 + lift * 0.04;
  const totalScore = Math.round(clamp(rawScore, 0, 100));
  const grade = totalScore >= 90 ? 'S' : totalScore >= 78 ? 'A' : totalScore >= 64 ? 'B' : totalScore >= 48 ? 'C' : 'D';
  const focus = L(lang, mode === 'distance' ? pair('822a 7a0b 6548 7387', 'range efficiency') : mode === 'airtime' ? pair('5347 529b 4fdd 6301', 'lift retention') : pair('76ee 6807 63a7 5236', 'target control'));
  return {
    distance: round(distance),
    airTime: round(airTime, 2),
    stability: Math.round(stability),
    lift: Math.round(lift),
    drag: Math.round(drag),
    accuracy: Math.round(accuracy),
    totalScore,
    grade,
    landingX,
    landingZ,
    targetX,
    targetZ,
    stallRisk: Math.round(stallRisk),
    coach: coachFlight(params, { drag, stability, accuracy, stallRisk }, mode, lang),
    analysis: L(lang, [
      `${L(lang, pair('672c 6b21', 'Run'))} ${grade}: ${totalScore}/100. ${focus}. Wing ${params.wingArea}%, fold ${params.foldAngle}deg, CG ${params.centerOfGravity}%.`,
      `This ${grade}-grade run scored ${totalScore}/100 by prioritizing ${focus}. Wing area ${params.wingArea}% and fold angle ${params.foldAngle} degrees set the lift-drag balance, while CG ${params.centerOfGravity}% controlled stability.`,
    ]),
  };
}

export default function App() {
  const [params, setParams] = useState<Params>(defaultParams);
  const [mode, setMode] = useState<Mode>('distance');
  const [targetPoint, setTargetPoint] = useState<TargetPoint>({ distance: 68, offset: -2.2 });
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('aerofold-lang') as Lang) || 'both');
  const [records, setRecords] = useState<Record<Mode, number>>(() => readRecords());
  const [lastResult, setLastResult] = useState<Result | null>(null);
  const [flightStatus, setFlightStatus] = useState<FlightStatus>('ready');
  const [runId, setRunId] = useState(0);
  const landingTimer = useRef<number | null>(null);
  const liveResult = useMemo(() => simulate(params, mode, lang, targetPoint), [params, mode, lang, targetPoint]);
  const shown = lastResult ?? liveResult;

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(records)), [records]);
  useEffect(() => localStorage.setItem('aerofold-lang', lang), [lang]);
  useEffect(() => () => { if (landingTimer.current) window.clearTimeout(landingTimer.current); }, []);

  const update = <K extends keyof Params>(key: K, value: Params[K]) => setParams((current) => ({ ...current, [key]: value }));
  const clearFlight = () => { if (landingTimer.current) window.clearTimeout(landingTimer.current); setLastResult(null); setFlightStatus('ready'); setRunId(0); };
  const launch = () => {
    const result = simulate(params, mode, lang, targetPoint);
    if (landingTimer.current) window.clearTimeout(landingTimer.current);
    setLastResult(null);
    setFlightStatus('flying');
    setRunId((id) => id + 1);
    landingTimer.current = window.setTimeout(() => {
      setLastResult(result);
      setFlightStatus('landed');
      setRecords((current) => (result.totalScore > current[mode] ? { ...current, [mode]: result.totalScore } : current));
    }, 1900);
  };
  const reset = () => { setParams(defaultParams); setTargetPoint({ distance: 68, offset: -2.2 }); clearFlight(); };
  const changeMode = (nextMode: Mode) => { setMode(nextMode); clearFlight(); };
  const changeTarget = (point: TargetPoint) => { setTargetPoint(point); if (flightStatus !== 'flying') setLastResult(null); };

  return (
    <main className="min-h-screen bg-[#eef5fb] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1640px] flex-col gap-4 px-4 py-4 lg:px-6">
        <Header mode={mode} setMode={changeMode} lang={lang} setLang={setLang} onLaunch={launch} />
        <section className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(520px,1fr)_350px]">
          <Controls params={params} update={update} reset={reset} lang={lang} />
          <Simulator params={params} result={shown} runId={runId} resetFlight={clearFlight} lang={lang} landed={flightStatus === 'landed'} mode={mode} targetPoint={targetPoint} setTargetPoint={changeTarget} />
          <Telemetry params={params} result={shown} records={records} mode={mode} status={flightStatus} lang={lang} />
        </section>
      </div>
    </main>
  );
}

function Header({ mode, setMode, lang, setLang, onLaunch }: { mode: Mode; setMode: (mode: Mode) => void; lang: Lang; setLang: (lang: Lang) => void; onLaunch: () => void }) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-white/80 bg-white/90 px-5 py-4 shadow-[0_18px_60px_rgba(15,45,90,0.09)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#096fe8] text-white shadow-lg shadow-blue-500/25"><PlaneTakeoff size={25} /></div>
        <div><h1 className="text-2xl font-semibold tracking-normal text-[#092047]">AeroFold Lab / {zh('4e91 7aef 7eb8 7ffc 5b9e 9a8c 5ba4')}</h1><p className="mt-1 text-sm font-medium text-slate-500">{L(lang, copy.subtitle)}</p></div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {(Object.keys(modeNames) as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${mode === item ? 'bg-white text-[#075fd0] shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{L(lang, modeNames[item]).replace(' Challenge', '')}</button>)}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><Languages size={16} />{L(lang, copy.language)}<select value={lang} onChange={(event) => setLang(event.target.value as Lang)} className="bg-transparent text-slate-900 outline-none"><option value="both">Bilingual</option><option value="zh">{zh('4e2d 6587')}</option><option value="en">English</option></select></label>
        <button onClick={onLaunch} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0877f2] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:bg-[#0565d1]"><PlaneTakeoff size={18} />{L(lang, copy.launch)}</button>
      </div>
    </header>
  );
}

function Controls({ params, update, reset, lang }: { params: Params; update: <K extends keyof Params>(key: K, value: Params[K]) => void; reset: () => void; lang: Lang }) {
  return (
    <aside className="rounded-lg border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,45,90,0.08)]">
      <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-[#092047]">{L(lang, copy.controls)}</h2><p className="mt-1 text-sm text-slate-500">{L(lang, copy.controlsSub)}</p></div><button onClick={reset} title="Reset" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-blue-700"><RotateCcw size={18} /></button></div>
      <div className="space-y-5">
        <Slider label={L(lang, pair('7ffc 9762 79ef', 'Wing Area'))} value={params.wingArea} min={30} max={90} unit="%" onChange={(value) => update('wingArea', value)} />
        <Slider label={L(lang, pair('91cd 5fc3 4f4d 7f6e', 'Center of Gravity'))} value={params.centerOfGravity} min={20} max={75} unit="% chord" onChange={(value) => update('centerOfGravity', value)} />
        <Slider label={L(lang, pair('6298 53e0 89d2', 'Fold Angle'))} value={params.foldAngle} min={12} max={70} unit="deg" onChange={(value) => update('foldAngle', value)} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-800">{L(lang, pair('7ffc 68a2 5c0f 7ffc', 'Winglet'))}</p><p className="mt-1 text-xs font-medium text-slate-500">{L(lang, pair('63d0 9ad8 7a33 5b9a 6027 ff0c 7565 5fae 589e 52a0 963b 529b', 'More stability, slightly more drag'))}</p></div><button onClick={() => update('winglets', !params.winglets)} className={`relative h-8 w-14 rounded-full transition ${params.winglets ? 'bg-[#0877f2]' : 'bg-slate-300'}`} aria-pressed={params.winglets}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${params.winglets ? 'left-7' : 'left-1'}`} /></button></div></div>
        <Slider label={L(lang, pair('6295 63b7 529b 91cf', 'Throw Power'))} value={params.throwPower} min={25} max={100} unit="%" onChange={(value) => update('throwPower', value)} />
        <Slider label={L(lang, pair('53d1 5c04 89d2', 'Launch Angle'))} value={params.launchAngle} min={8} max={45} unit="deg" onChange={(value) => update('launchAngle', value)} />
        <Slider label={L(lang, pair('6295 63b7 65b9 5411', 'Throw Direction'))} value={params.launchDirection} min={-28} max={28} unit="deg" onChange={(value) => update('launchDirection', value)} />
        
        <div className="mt-4 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-[#092047] mb-3">{L(lang, copy.environment)}</h3>
          <Slider label={L(lang, copy.windSpeed)} value={params.windSpeed} min={0} max={50} unit="%" onChange={(value) => update('windSpeed', value)} />
          <Slider label={L(lang, copy.windDirection)} value={params.windDirection} min={-180} max={180} unit="°" onChange={(value) => update('windDirection', value)} />
        </div>
      </div>
    </aside>
  );
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return <label className="block rounded-lg border border-slate-200 bg-white p-4"><span className="mb-3 flex items-center justify-between gap-4"><span className="text-sm font-semibold text-slate-800">{label}</span><span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{value}{unit}</span></span><input className="slider" style={{ '--value': `${pct}%` } as CSSProperties} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Simulator({ params, result, runId, resetFlight, lang, landed, mode, targetPoint, setTargetPoint }: { params: Params; result: Result; runId: number; resetFlight: () => void; lang: Lang; landed: boolean; mode: Mode; targetPoint: TargetPoint; setTargetPoint: (point: TargetPoint) => void }) {
  const [zoom, setZoom] = useState(1);
  const showTarget = mode === 'precision';
  return (
    <section className="flex min-h-[720px] flex-col gap-4 rounded-lg border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,45,90,0.08)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-semibold text-[#092047]">{L(lang, copy.simulator)}</h2><p className="mt-1 text-sm text-slate-500">{L(lang, copy.simulatorSub)}</p></div><button onClick={resetFlight} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><RotateCcw size={17} />{L(lang, copy.resetFlight)}</button></div>
      <div className="grid flex-1 grid-rows-[220px_minmax(420px,1fr)] gap-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-white via-[#f7fbff] to-[#eaf5ff]"><ModelPreview3D params={params} lang={lang} /></div>
        <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-[#f8fbff]">
          <div className="absolute left-3 top-3 z-10 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">{landed ? L(lang, pair('5b8c 6574 822a 8ff9', 'Full path after landing')) : L(lang, copy.predicted)}</div>
          <div className="absolute right-3 top-3 z-10 flex gap-2 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur"><button title="Zoom in" onClick={() => setZoom((value) => clamp(value + 0.18, 0.65, 1.55))} className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-700"><ZoomIn size={17} /></button><button title="Zoom out" onClick={() => setZoom((value) => clamp(value - 0.18, 0.65, 1.55))} className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-700"><ZoomOut size={17} /></button><button title="Reset view" onClick={() => setZoom(1)} className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-700"><Home size={17} /></button></div>
          {showTarget && <div className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-emerald-200 bg-white/92 px-4 py-3 shadow-sm backdrop-blur"><div className="flex items-center justify-between text-xs font-bold text-emerald-700"><span>{L(lang, copy.targetHint)}</span><span>{Math.round(targetPoint.distance)} m / {targetPoint.offset.toFixed(1)}</span></div></div>}
          <FlightScene3D params={params} result={result} runId={runId} lang={lang} zoom={zoom} landed={landed} showTarget={showTarget} setTargetPoint={setTargetPoint} />
        </div>
      </div>
    </section>
  );
}

function ModelPreview3D({ params, lang }: { params: Params; lang: Lang }) {
  return <div className="relative h-full w-full"><div className="absolute left-4 top-4 z-10 rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur">{L(lang, copy.model)}</div><Canvas camera={{ position: [3.6, 2.5, 4.2], fov: 38 }} dpr={[1, 1.6]}><color attach="background" args={['#f8fcff']} /><ambientLight intensity={0.95} /><directionalLight position={[4, 5, 4]} intensity={1.35} /><group rotation={[0.18, -0.58, -0.04]} position={[0, -0.15, 0]}><PaperAirplaneModel params={params} /></group><OrbitControls enablePan={false} enableZoom minDistance={3.5} maxDistance={7} /></Canvas></div>;
}

function FlightScene3D({ params, result, runId, lang, zoom, landed, showTarget, setTargetPoint }: { params: Params; result: Result; runId: number; lang: Lang; zoom: number; landed: boolean; showTarget: boolean; setTargetPoint: (point: TargetPoint) => void }) {
  const actualLanding = getActualLandingPosition(result, params);
  return <Canvas onContextMenu={(event) => event.preventDefault()} camera={{ position: [9, 7, 13], fov: 45 }} shadows dpr={[1, 1.6]}><CameraRig zoom={zoom} /><color attach="background" args={['#f8fcff']} /><ambientLight intensity={0.8} /><directionalLight castShadow position={[8, 12, 6]} intensity={1.5} /><fog attach="fog" args={['#f8fcff', 16, 34]} /><Grid args={[24, 18]} cellSize={1} cellThickness={0.6} cellColor="#bfdbfe" sectionSize={4} sectionThickness={1.2} sectionColor="#60a5fa" position={[0, -0.02, 0]} />{showTarget && <TargetZone x={mapDistance(result.targetX)} z={result.targetZ} label={L(lang, pair('76ee 6807', 'TARGET'))} color="#10b981" setTargetPoint={setTargetPoint} />}{landed && <LandingMarker x={actualLanding.x} z={actualLanding.z} runId={runId} label={L(lang, pair('964d 843d 70b9', 'LANDING'))} />}<FlightArc result={result} reveal={landed ? 1 : 0.42} soft={!landed} params={params} /><FlyingPaperPlane params={params} result={result} runId={runId} /><WindIndicator params={params} /><Text position={[-9.2, 0.1, 4.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.35} color="#075985">{L(lang, pair('53d1 5c04 533a', 'LAUNCH'))}</Text><OrbitControls makeDefault enableZoom enablePan={true} minDistance={7} maxDistance={24} maxPolarAngle={Math.PI / 2.05} /></Canvas>;
}

function CameraRig({ zoom }: { zoom: number }) {
  const { camera } = useThree();
  useEffect(() => { const distance = 17 / zoom; camera.position.set(distance * 0.52, distance * 0.41, distance * 0.76); camera.lookAt(0, 1.2, 0); camera.updateProjectionMatrix(); }, [camera, zoom]);
  return null;
}

function mapDistance(distance: number) { return -9 + (clamp(distance, 0, 112) / 112) * 18; }
function unmapDistance(x: number) { return clamp(((x + 9) / 18) * 112, 0, 112); }
function arcPoint(result: Result, t: number, params?: Params) {
  const start = new THREE.Vector3(-9, 0.35, 3.2);
  const end = new THREE.Vector3(mapDistance(result.landingX), 0.35, result.landingZ);
  const height = 2.2 + result.airTime * 0.45 + result.lift * 0.012;
  
  let windOffset = new THREE.Vector3(0, 0, 0);
  if (params) {
    const windSpeedNorm = params.windSpeed / 100;
    const windDirRad = THREE.MathUtils.degToRad(params.windDirection);
    windOffset.x = Math.cos(windDirRad) * windSpeedNorm * 8 * t * t;
    windOffset.z = Math.sin(windDirRad) * windSpeedNorm * 5 * t * t;
  }
  
  return new THREE.Vector3(
    THREE.MathUtils.lerp(start.x, end.x, t) + windOffset.x,
    start.y + Math.sin(Math.PI * t) * height,
    THREE.MathUtils.lerp(start.z, end.z, t) + Math.sin(Math.PI * t * 2) * (100 - result.stability) * 0.018 + windOffset.z
  );
}

function FlyingPaperPlane({ params, result, runId }: { params: Params; result: Result; runId: number }) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef(runId > 0 ? 0 : 0.02);
  const lastRun = useRef(runId);
  useFrame((_, delta) => {
    if (!group.current) return;
    if (lastRun.current !== runId) { progress.current = 0; lastRun.current = runId; }
    if (runId > 0) progress.current = Math.min(1, progress.current + delta / 1.9);
    const t = runId > 0 ? progress.current : 0.08;
    const p = arcPoint(result, t, params);
    const before = arcPoint(result, Math.max(0, t - 0.025), params);
    const after = arcPoint(result, Math.min(1, t + 0.025), params);
    const direction = after.clone().sub(before).normalize();
    group.current.position.copy(p);
    group.current.lookAt(p.clone().add(direction));
    group.current.rotateY(-Math.PI / 2);
    group.current.rotateZ((50 - result.stability) * 0.004 * Math.sin(t * Math.PI * 6));
  });
  return <group ref={group}><PaperAirplaneModel params={params} /></group>;
}

function WindIndicator({ params }: { params: Params }) {
  const windSpeedNorm = params.windSpeed / 100;
  const windDirRad = THREE.MathUtils.degToRad(params.windDirection);
  
  if (windSpeedNorm <= 0) return null;
  
  return (
    <group position={[-7, 0.5, -5]}>
      {/* 风向箭头 */}
      <group rotation={[0, windDirRad, 0]}>
        {/* 箭头主体 */}
        <mesh position={[0, 0, 0]}>
          <coneGeometry args={[0.2 + windSpeedNorm * 0.3, 0.8 + windSpeedNorm * 0.8, 8]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
        
        {/* 箭头基座 */}
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.15, 0.25, 0.3, 16]} />
          <meshStandardMaterial color="#1e40af" />
        </mesh>
        
        {/* 风尾效果 */}
        {windSpeedNorm > 0.2 && (
          <group position={[0, 0, -0.5 - windSpeedNorm * 0.8]}>
            {[...Array(Math.floor(windSpeedNorm * 4) + 1)].map((_, i) => (
              <mesh key={i} position={[0, 0, i * 0.4]}>
                <ringGeometry args={[0.1 + i * 0.08, 0.15 + i * 0.1, 12]} />
                <meshStandardMaterial color="#60a5fa" transparent opacity={0.5 - i * 0.1} />
              </mesh>
            ))}
          </group>
        )}
      </group>
      
      {/* 风速显示 */}
      <Text position={[0, 1.2, 0]} fontSize={0.25} color="#1e40af" anchorX="center">
        {params.windSpeed}%
      </Text>
    </group>
  );
}

function PaperAirplaneModel({ params }: { params: Params }) {
  const scale = 0.85 + params.wingArea / 150;
  const dihedral = 0.12 + params.foldAngle / 260;
  const span = 0.82 + params.wingArea / 135;
  const cg = (params.centerOfGravity - 48) / 120;
  return <group scale={[scale, scale, scale]}><PaperPanel color="#f8fbff" points={[[1.45, 0, 0], [-0.98, 0.03, 0.08], [-0.42, dihedral, span]]} /><PaperPanel color="#e8f4ff" points={[[1.45, 0, 0], [-0.98, 0.03, -0.08], [-0.42, dihedral, -span]]} /><PaperPanel color="#dbeafe" points={[[1.45, 0, 0], [-0.42, dihedral, span], [0.02, 0.09, 0.08]]} /><PaperPanel color="#eff6ff" points={[[1.45, 0, 0], [0.02, 0.09, -0.08], [-0.42, dihedral, -span]]} /><PaperPanel color="#bfdbfe" points={[[-0.98, 0.03, 0.08], [-0.42, dihedral, span], [-0.78, 0.16, 0.18]]} /><PaperPanel color="#dbeafe" points={[[-0.98, 0.03, -0.08], [-0.78, 0.16, -0.18], [-0.42, dihedral, -span]]} /><mesh position={[0.02, 0.092, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.025, 0.025, 2.15]} /><meshStandardMaterial color="#60a5fa" roughness={0.6} /></mesh>{params.winglets && <><PaperPanel color="#2563eb" points={[[-0.42, dihedral, span], [-0.62, dihedral + 0.42, span + 0.08], [-0.82, dihedral + 0.08, span - 0.08]]} /><PaperPanel color="#2563eb" points={[[-0.42, dihedral, -span], [-0.82, dihedral + 0.08, -span + 0.08], [-0.62, dihedral + 0.42, -span - 0.08]]} /></>}<mesh position={[cg, 0.16, 0]}><sphereGeometry args={[0.055, 16, 16]} /><meshStandardMaterial color="#f59e0b" /></mesh></group>;
}

function PaperPanel({ points, color }: { points: [number, number, number][]; color: string }) {
  const geometry = useMemo(() => { const geom = new THREE.BufferGeometry(); geom.setFromPoints(points.map((point) => new THREE.Vector3(...point))); geom.setIndex([0, 1, 2]); geom.computeVertexNormals(); return geom; }, [points]);
  return <mesh castShadow receiveShadow geometry={geometry}><meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} /></mesh>;
}

function FlightArc({ result, reveal, soft, params }: { result: Result; reveal: number; soft: boolean; params?: Params }) {
  const points = useMemo(() => {
    const count = Math.max(4, Math.round(64 * reveal));
    return Array.from({ length: count }, (_, index) => arcPoint(result, (index / Math.max(1, count - 1)) * reveal, params));
  }, [result, reveal, params]);
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  const glow = useMemo(() => new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: soft ? 0.16 : 0.24 })), [geometry, soft]);
  const line = useMemo(() => new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: soft ? '#0ea5e9' : '#0877f2', transparent: true, opacity: soft ? 0.46 : 0.95, dashSize: soft ? 0.28 : 0.02, gapSize: soft ? 0.2 : 0.02 })), [geometry, soft]);
  useEffect(() => {
    line.computeLineDistances();
    glow.computeLineDistances();
  }, [line, glow]);
  return <group>{soft && <primitive object={glow} scale={[1.012, 1.012, 1.012]} />}<primitive object={line} /></group>;
}

function TargetZone({ x, z, label, color, setTargetPoint }: { x: number; z: number; label: string; color: string; setTargetPoint: (point: TargetPoint) => void }) {
  const dragging = useRef(false);
  const moveTarget = (event: any) => {
    event.stopPropagation();
    setTargetPoint({ distance: Math.round(unmapDistance(event.point.x)), offset: round(clamp(event.point.z, -7.8, 7.8), 1) });
  };
  return <group position={[x, 0.02, z]} onContextMenu={(event: any) => event.stopPropagation()} onPointerDown={(event: any) => { if (event.button === 2) { dragging.current = true; moveTarget(event); } }} onPointerMove={(event: any) => { if (dragging.current) moveTarget(event); }} onPointerUp={(event: any) => { event.stopPropagation(); dragging.current = false; }} onPointerLeave={() => { dragging.current = false; }}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.78, 48]} /><meshBasicMaterial color={color} transparent opacity={0.55} /></mesh><mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.22, 32]} /><meshBasicMaterial color={color} transparent opacity={0.9} /></mesh><Text position={[0, 1.25, 0]} fontSize={0.35} color={color} anchorX="center">{label}</Text></group>;
}

function LandingMarker({ x, z, runId, label }: { x: number; z: number; runId: number; label: string }) {
  return <group key={runId} position={[x, 0.04, z]}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.2, 0.38, 32]} /><meshBasicMaterial color="#f59e0b" transparent opacity={0.7} /></mesh><mesh position={[0, 0.45, 0]}><sphereGeometry args={[0.15, 24, 24]} /><meshStandardMaterial color="#f59e0b" /></mesh><Text position={[0, 0.85, 0]} fontSize={0.28} color="#b45309" anchorX="center">{label}</Text></group>;
}

function getActualLandingPosition(result: Result, params?: Params): { x: number; z: number } {
  const point = arcPoint(result, 1, params);
  return { x: point.x, z: point.z };
}

function Telemetry({ params, result, records, mode, status, lang }: { params: Params; result: Result; records: Record<Mode, number>; mode: Mode; status: FlightStatus; lang: Lang }) {
  const landed = status === 'landed';
  const statusText = status === 'flying' ? L(lang, pair('98de 884c 91c7 96c6 4e2d ff0c 843d 5730 540e 751f 6210 7ed3 679c', 'Recording flight data. Results appear after landing.')) : landed ? L(lang, pair('5df2 843d 5730 ff0c 6d4b 8bd5 62a5 544a 5df2 751f 6210', 'Landed. Test report generated.')) : L(lang, pair('7b49 5f85 53d1 5c04', 'Awaiting launch'));
  const metricValue = (value: string) => (landed ? value : '--');
  const safeNumber = (value: number) => isNaN(value) ? '' : value;
  const metrics = [
    { label: L(lang, pair('8ddd 79bb', 'Distance')), value: metricValue(`${safeNumber(result.distance)} m`), score: landed ? result.distance : 0, icon: Ruler },
    { label: L(lang, pair('6ede 7a7a', 'Air Time')), value: metricValue(`${safeNumber(result.airTime)} s`), score: landed ? result.airTime * 16 : 0, icon: Timer },
    { label: L(lang, pair('7a33 5b9a 6027', 'Stability')), value: metricValue(`${safeNumber(result.stability)}%`), score: landed ? result.stability : 0, icon: Activity },
    { label: L(lang, pair('5347 529b', 'Lift')), value: metricValue(`${safeNumber(result.lift)}%`), score: landed ? result.lift : 0, icon: PlaneTakeoff },
    { label: L(lang, pair('963b 529b', 'Drag')), value: metricValue(`${safeNumber(result.drag)}%`), score: landed ? 100 - result.drag : 0, icon: Wind },
    { label: L(lang, pair('7cbe 5ea6', 'Accuracy')), value: metricValue(`${safeNumber(result.accuracy)}%`), score: landed ? result.accuracy : 0, icon: Target },
  ];
  const coachItems = landed ? result.coach : [statusText];
  return <aside className="flex flex-col gap-4 rounded-lg border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,45,90,0.08)]"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[#092047]">{L(lang, copy.telemetry)}</h2><p className="mt-1 text-sm text-slate-500">{L(lang, modeNames[mode])}</p></div><div className="grid h-16 w-16 place-items-center rounded-lg bg-[#092047] text-3xl font-black text-white shadow-lg shadow-slate-900/20">{landed ? result.grade : '-'}</div></div><div className="rounded-lg border border-blue-100 bg-blue-50 p-4"><div className="flex items-center justify-between"><span className="text-sm font-bold text-blue-900">{L(lang, copy.score)}</span><span className="text-3xl font-black text-[#075fd0]">{landed ? result.totalScore : '--'}</span></div><p className="mt-2 text-xs font-bold text-blue-700">{statusText}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#0877f2] meter-fill" style={{ width: `${landed ? result.totalScore : status === 'flying' ? 55 : 0}%` }} /></div></div><div className="grid grid-cols-2 gap-3">{metrics.map((metric) => { const Icon = metric.icon; return <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between text-slate-500"><Icon size={16} /><span className="text-[11px] font-bold uppercase tracking-normal">{metric.label}</span></div><p className="text-lg font-black text-[#092047]">{metric.value}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-500 meter-fill" style={{ width: `${clamp(metric.score, 0, 100)}%` }} /></div></div>; })}</div><section className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><Award size={17} className="text-amber-500" /><h3 className="text-sm font-bold text-slate-900">{L(lang, copy.records)}</h3></div><div className="flex items-center justify-between rounded-md bg-white px-3 py-3 text-sm shadow-sm"><span className="font-bold text-blue-700">{L(lang, modeNames[mode])}</span><span className="text-2xl font-black text-slate-900">{records[mode]}</span></div></section><section className="rounded-lg border border-blue-100 bg-[#f7fbff] p-4"><div className="mb-3 flex items-center gap-2"><Award size={17} className="text-blue-600" /><h3 className="text-sm font-bold text-slate-900">{L(lang, copy.coach)}</h3></div><ul className="space-y-2">{coachItems.map((tip) => <li key={tip} className="rounded-md bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-600 shadow-sm">{tip}</li>)}</ul></section><section className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">{L(lang, copy.report)}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{landed ? result.analysis : L(lang, pair('843d 5730 540e 751f 6210 53c2 6570 3001 7ed3 679c 548c 6539 8fdb 5efa 8bae 3002', 'After landing, the report will include parameters, results, analysis, and improvement suggestions.'))}</p>{landed && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold leading-5 text-slate-700">{L(lang, copy.next)}: {result.coach[0]}</p>}<div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500"><span>{L(lang, pair('7ffc 9762', 'Wing'))} {params.wingArea}%</span><span>CG {params.centerOfGravity}%</span><span>{L(lang, pair('6298 89d2', 'Fold'))} {params.foldAngle}deg</span><span>{L(lang, pair('529b 91cf', 'Power'))} {params.throwPower}%</span><span>{L(lang, pair('89d2 5ea6', 'Angle'))} {params.launchAngle}deg</span><span>{L(lang, pair('5c0f 7ffc', 'Winglets'))} {params.winglets ? 'On' : 'Off'}</span></div></section></aside>;
}
