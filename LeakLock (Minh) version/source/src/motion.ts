// Native disclosures keep their keyboard behavior; browsers without auto-size
// interpolation retain instant, fully functional open/close behavior.
export const disclosureMotion = `
@supports (interpolate-size: allow-keywords) {
  details { interpolate-size: allow-keywords; }
  details::details-content {
    block-size: 0;
    opacity: 0;
    overflow: clip;
    transition: block-size 220ms cubic-bezier(.2,.7,.2,1), opacity 160ms ease, content-visibility 220ms allow-discrete;
  }
  details[open]::details-content { block-size: auto; opacity: 1; }
}
summary { transition: color 160ms ease; }
@media (prefers-reduced-motion: reduce) {
  details::details-content, summary { transition: none !important; }
}
`;
