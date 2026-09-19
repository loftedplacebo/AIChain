"use client";

import { useState } from "react";

const shots = [
  ["customer-problem.png", "A customer needs help.", "A delivery has not arrived. The assistant begins with the information it is allowed to use."],
  ["human-review.png", "A limit is crossed.", "The refund needs a decision beyond the assistant’s approved limit. The workflow pauses for review."],
  ["customer-resolution.png", "A person makes the call.", "The support lead approves the outcome. The customer gets a clear answer."],
  ["trusted-record.png", "One action. Different views. One trusted record.", "The authority, exception and decision settle into a connected history for the people entitled to inspect it."],
];

export function CustomerServiceFilm() {
  const [paused, setPaused] = useState(false);
  return <section className="film-shell" aria-label="Customer-service story film"><div className="film-stage" data-paused={paused ? "true" : "false"}>{shots.map(([image, title, copy], index) => <figure className={`film-shot film-shot-${index + 1}`} key={image} aria-hidden="true"><img src={`/film/${image}`} alt="" /><figcaption><p>0{index + 1} / CUSTOMER STORY</p><h2>{title}</h2><span>{copy}</span></figcaption></figure>)}<div className="film-progress" aria-hidden="true"><i /><i /><i /><i /></div><button className="film-toggle" type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? "Play story" : "Pause story"}</button></div><div className="film-transcript"><p className="eyebrow">The story</p><h2>Useful to the customer. Clear to the team. Accountable to everyone else.</h2><ol>{shots.map(([, title, copy]) => <li key={title}><strong>{title}</strong><span>{copy}</span></li>)}</ol><p className="caption">Illustrative product story. Orvessian is not currently a live customer-service, approval or safety-control product.</p></div></section>;
}
