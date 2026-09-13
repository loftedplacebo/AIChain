"use client";

import { useEffect, useRef, useState } from "react";
import { storyPaths, storySlides } from "./story-data";

export function StoryExperience() {
  const [index, setIndex] = useState(0);
  const [pathIndex, setPathIndex] = useState(1);
  const [ready, setReady] = useState(false);
  const region = useRef<HTMLElement>(null);
  const slide = storySlides[index];
  const path = storyPaths[pathIndex];

  useEffect(() => {
    setReady(true);
    const sync = () => {
      const match = /^#slide-([^~]+)(?:~([^~]+))?$/.exec(window.location.hash);
      if (!match) return;
      const next = storySlides.findIndex(item => item.id === match[1]);
      if (next < 0) return;
      setIndex(next);
      const branch = storyPaths.findIndex(item => item.id === match[2]);
      if (branch >= 0) setPathIndex(branch);
      region.current?.scrollIntoView({ block: "start", behavior: "instant" });
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, []);

  function show(next: number, branch = pathIndex) {
    const bounded = Math.max(0, Math.min(storySlides.length - 1, next));
    setIndex(bounded);
    setPathIndex(branch);
    window.history.pushState(null, "", `#slide-${storySlides[bounded].id}~${storyPaths[branch].id}`);
  }

  return <section className="guided-story" id="walkthrough" ref={region} aria-label="Guided supplier assessment" onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target !== region.current) return;
    if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); }
    if (event.key === "Home") { event.preventDefault(); show(0); }
    if (event.key === "End") { event.preventDefault(); show(storySlides.length - 1); }
  }} tabIndex={0}>
    <div className="guided-topline"><span>ONE JOB / SIX MOMENTS</span><a href="#full-story">Read the full story ↓</a></div>
    <div className="guided-layout" aria-live="polite" aria-atomic="true">
      <div className="guided-copy"><p className="eyebrow">0{index + 1} / {slide.role}</p><h2>{slide.title.split("\n").map((line,i) => <span key={line}>{i > 0 && <br/>}{line}</span>)}</h2><p>{slide.text}</p>
        {index === 3 && <div className="path-picker"><p>Explore an ending</p><div className="path-buttons" aria-label="Illustrative story outcomes">{storyPaths.map((item,i) => <button type="button" key={item.id} aria-pressed={pathIndex === i} disabled={!ready} onClick={() => show(index,i)}>{item.label}</button>)}</div><div className="path-result"><h3>{path.title}</h3><p>{path.text}</p></div></div>}
        <p className="guided-limit">{slide.note}</p>
      </div>
      <div className={`guided-art guided-art-${slide.id}`}>
        <div className="document-topline"><span>ORVESSIAN</span><span>ILLUSTRATIVE</span></div>
        <div className="document-body"><p className="eyebrow">SUPPLIER ASSESSMENT</p><h3>{slide.document}</h3><p className={`document-state state-${slide.id}`}>{index === 3 || index === 4 ? path.status : slide.status}</p>
          <dl>{(index === 3 || index === 4 ? [["Decision", path.status],["Evidence",path.evidence],["Authority", "Recommendation only"]] : slide.fields).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {(index === 3 || index === 4) && <p className="document-note">{path.limit}</p>}
          {index === 5 && <p className="document-note">Retrieve the recorded file, or create a new linked record for the update.</p>}
        </div><div className="document-footer"><span>Authority</span><span>Evidence</span><span>Review</span></div>
      </div>
    </div>
    <div className="guided-controls"><button type="button" aria-label="Previous chapter" disabled={!ready || index === 0} onClick={() => show(index - 1)}>← <span>Previous</span></button><p>Chapter {index + 1} of {storySlides.length}<small>Focus this story and use ← → to explore</small></p><button type="button" aria-label={index === storySlides.length - 1 ? "Restart story" : "Next chapter"} disabled={!ready} onClick={() => show(index === storySlides.length - 1 ? 0 : index + 1)}><span>{index === storySlides.length - 1 ? "Restart" : "Next"}</span> →</button></div>
    <ol className="guided-chapters" aria-label="Choose a chapter">{storySlides.map((item,i) => <li key={item.id}><button type="button" disabled={!ready} aria-current={index === i ? "step" : undefined} onClick={() => show(i)}><span>0{i+1}</span>{item.label}</button></li>)}</ol>
    <p className="guided-disclaimer">Product illustration, not a live customer workflow. The full readable account and all alternative outcomes remain below.</p>
    <noscript><p>The guided controls need JavaScript. <a href="#full-story">Read all chapters and outcomes below.</a></p></noscript>
  </section>;
}
