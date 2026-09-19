"use client";

import { useState } from "react";

const shots = [
  ["customer-problem.png", "A delivery is missing.", "The customer asks for help. Nothing arrives at her door.", "Interaction started"],
  ["assistant-checks.png", "The AI assistant checks the order.", "It looks at the order and delivery details it is allowed to use.", "Order and delivery checks"],
  ["review-needed.png", "The refund needs approval.", "The amount is beyond the assistant’s limit, so it stops and asks for review.", "Approval boundary reached"],
  ["human-review.png", "A support lead makes the call.", "They see the relevant context and approve the exception during the working day.", "Decision and approver"],
  ["customer-resolution.png", "The customer gets a clear answer.", "The decision is explained simply, without asking the customer to understand the internal workflow.", "Customer outcome sent"],
  ["trusted-record.png", "One action. Different views. One trusted record.", "The authority, checks, exception and decision settle into a connected history for the people entitled to inspect it.", "Connected history, ready to check"],
];

export function CustomerServiceFilm() {
  const [paused, setPaused] = useState(false);
  return <section className="film-shell" aria-label="Customer-service story film"><div className="film-stage" data-paused={paused ? "true" : "false"}><div className="film-trust-thread" aria-hidden="true"><i /></div>{shots.map(([image, title, copy, record], index) => <figure className={`film-shot film-shot-${index + 1}`} key={image} aria-hidden="true"><img src={`/film/${image}`} alt="" /><figcaption><p>0{index + 1} / CUSTOMER STORY</p><h2>{title}</h2><span>{copy}</span></figcaption><aside className="film-record-callout"><span>ADDED TO THE TRUSTED RECORD</span><strong>{record}</strong></aside></figure>)}<div className="film-progress" aria-hidden="true">{shots.map(([, title]) => <i key={title} />)}</div><button className="film-toggle" type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? "Play story" : "Pause story"}</button></div><div className="film-transcript"><p className="eyebrow">The story</p><h2>Useful to the customer. Clear to the team. Accountable to everyone else.</h2><ol>{shots.map(([, title, copy, record]) => <li key={title}><strong>{title}</strong><span>{copy}<em>Trusted record: {record}.</em></span></li>)}</ol><p className="caption">Illustrative product story. Orvessian is not currently a live customer-service, approval or safety-control product.</p></div></section>;
}
