"use client";

import { useEffect, useRef, useState } from "react";

const layers = [
  { name: "Authority", question: "Who was allowed to act?", description: "The brief, the responsible organisation and the limits of the job. Your application enforces those limits." },
  { name: "Evidence", question: "What was the decision based on?", description: "A record tied to the evidence used. Keep the private material with its custodian; disclose only what a reviewer needs." },
  { name: "Review", question: "What did someone actually check?", description: "The decision, its reviewer and the evidence version considered. A recorded judgement is not a guarantee of truth." },
];

export function LivingReceipt() {
  const [active, setActive] = useState(1);
  const [motion, setMotion] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setReady(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change",update);
    return () => query.removeEventListener("change",update);
  }, []);

  return <div className="living-receipt" data-motion={motion && !reduced ? "on" : "off"}>
    <div className="living-scene" onPointerMove={event => {
      if (!motion || reduced || event.pointerType !== "mouse") return;
      const box = event.currentTarget.getBoundingClientRect();
      stage.current?.style.setProperty("--tilt-x", `${((event.clientY - box.top) / box.height - .5) * -8}deg`);
      stage.current?.style.setProperty("--tilt-y", `${((event.clientX - box.left) / box.width - .5) * 10}deg`);
    }} onPointerLeave={() => {
      stage.current?.style.setProperty("--tilt-x", "0deg");
      stage.current?.style.setProperty("--tilt-y", "0deg");
    }}><div className="receipt-stage" ref={stage} role="img" aria-label="An amber droplet passes through three floating glass layers, then dissolves into gentle ripples on the final surface. Concept illustration of authority, evidence and review.">
      {[0,1,2].map(index => <div className={`receipt-slice slice-${index}`} key={index}><img src="/glass-wafer-alpha.png" width="1536" height="1024" fetchPriority={index === 0 ? "high" : "auto"} alt="" draggable={false}/><span className={`surface-response response-${index}`} aria-hidden="true"/>{index === 2 && <span className="electric-charge" aria-hidden="true"><img src="/glass-wafer-alpha.png" width="1536" height="1024" alt="" draggable={false}/></span>}{index === 2 && <span className="absorption-surface" aria-hidden="true"><i className="water-dimple"/><i className="water-ring ring-one"/><i className="water-ring ring-two"/></span>}</div>)}
      <span className="liquid-drop" aria-hidden="true"><i/></span>
    </div>
      <div className="layer-markers" aria-label="Explore the receipt layers">{layers.map((layer,index) => <button type="button" key={layer.name} className={`layer-marker marker-${index}`} disabled={!ready} aria-label={`Explore ${layer.name.toLowerCase()}`} aria-pressed={active === index} onClick={() => setActive(index)}><span>0{index+1}</span><span>{layer.name}</span></button>)}</div>
    </div>
    <div className="living-caption"><span>THE LIVING RECEIPT / CONCEPT ART</span><button type="button" disabled={!ready || reduced} onClick={() => setMotion(value=>!value)}>{reduced ? "Reduced motion" : motion ? "Pause motion" : "Enable motion"}</button></div>
    <div className="layer-explanation" aria-live="polite" aria-atomic="true"><span className="eyebrow">{layers[active].name}</span><h2>{layers[active].question}</h2><p>{layers[active].description}</p></div>
    <noscript><p>Authority, evidence and review form an inspectable record. Explore each in the <a href="/product">product explanation</a>.</p></noscript>
  </div>;
}
