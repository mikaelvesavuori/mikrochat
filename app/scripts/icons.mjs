const reactionIconMap = new Map([
  ['\u{1f44d}', 'hand-thumb-up'],
  ['\u{1f44e}', 'hand-thumb-down'],
  ['\u2764\ufe0f', 'heart'],
  ['\u{1f525}', 'fire'],
  ['\u{1f602}', 'face-smile'],
  ['\u{1f62e}', 'face-surprise'],
  ['\u{1f389}', 'sparkles'],
  ['\u{1f440}', 'eye'],
  ['\u{1f64f}', 'hands-thanks'],
  ['\u{1f44b}', 'hand-wave'],
  ['\u2705', 'check'],
  ['\u2b50', 'star']
]);

export function icon(name, className = 'icon') {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
}

export function reactionIcon(reaction) {
  const iconName = reactionIconMap.get(reaction);

  return icon(iconName || 'sparkles', 'icon reaction-icon');
}
