import sanitizeHtml from 'npm:sanitize-html@2.17.0';

const allowedStyles = {
  '*': {
    'background': [/^#[\da-f]{3,8}$/i, /^transparent$/i, /^white$/i],
    'background-color': [/^#[\da-f]{3,8}$/i, /^transparent$/i, /^white$/i],
    'border-bottom': [/^\d{1,2}px solid #[\da-f]{3,8}$/i],
    'border-left': [/^\d{1,2}px solid #[\da-f]{3,8}$/i],
    'border-top': [/^\d{1,2}px solid #[\da-f]{3,8}$/i],
    'color': [/^#[\da-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i, /^white$/i],
    'display': [/^(block|inline-block)$/i],
    'font-family': [/^[a-z\d ,'-]{1,80}$/i],
    'font-size': [/^\d{1,2}px$/i],
    'font-style': [/^(normal|italic)$/i],
    'font-weight': [/^(normal|bold|[1-9]00)$/i],
    'letter-spacing': [/^[\d.]+(px|em)$/i],
    'line-height': [/^[\d.]+(px|em)?$/i],
    'margin': [/^(0|[\d.]+(px|em))( (0|[\d.]+(px|em))){0,3}$/i],
    'margin-bottom': [/^(0|[\d.]+(px|em))$/i],
    'margin-top': [/^(0|[\d.]+(px|em))$/i],
    'padding': [/^(0|[\d.]+(px|em))( (0|[\d.]+(px|em))){0,3}$/i],
    'text-align': [/^(left|center|right)$/i],
    'text-decoration': [/^(none|underline)$/i],
    'text-transform': [/^(none|uppercase|lowercase|capitalize)$/i],
  },
};

export function sanitizeCampaignHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
      'a', 'blockquote', 'br', 'div', 'em', 'h1', 'h2', 'h3', 'hr', 'li',
      'ol', 'p', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
    ],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'title', 'style'],
      td: ['colspan', 'rowspan', 'style'],
      th: ['colspan', 'rowspan', 'style'],
    },
    allowedStyles,
    allowedSchemes: ['https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
}