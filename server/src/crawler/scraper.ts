// Content extraction utilities for higher education websites

export interface ExtractedContent {
  title: string | null;
  description: string | null;
  headings: string[];
  paragraphs: string[];
  links: Array<{ href: string; text: string }>;
  images: Array<{ src: string; alt: string }>;
  metadata: Record<string, string>;
  mainContent: string | null;
  structuredData: Record<string, unknown>[];
}

// Extract metadata from HTML
export function extractMetadata(html: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  // Meta tags
  const metaRegex = /<meta\s+(?:name|property)=["']([^"']+)["']\s+content=["']([^"']+)["']/gi;
  let match;

  while ((match = metaRegex.exec(html)) !== null) {
    metadata[match[1]] = match[2];
  }

  // Alternative format
  const metaRegex2 = /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["']([^"']+)["']/gi;
  while ((match = metaRegex2.exec(html)) !== null) {
    metadata[match[2]] = match[1];
  }

  return metadata;
}

// Extract title from HTML
export function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1].trim());
  }

  // Fallback to og:title
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    return decodeHtmlEntities(ogTitleMatch[1]);
  }

  return null;
}

// Extract description from HTML
export function extractDescription(html: string): string | null {
  // Meta description
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (descMatch) {
    return decodeHtmlEntities(descMatch[1]);
  }

  // Alternative format
  const descMatch2 = html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (descMatch2) {
    return decodeHtmlEntities(descMatch2[1]);
  }

  // og:description fallback
  const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (ogDescMatch) {
    return decodeHtmlEntities(ogDescMatch[1]);
  }

  return null;
}

// Extract headings from HTML
export function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const headingRegex = /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const heading = decodeHtmlEntities(match[1].trim());
    if (heading) {
      headings.push(heading);
    }
  }

  return headings;
}

// Extract main content text
export function extractMainContent(html: string): string | null {
  // Remove script and style tags
  let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Try to find main content area
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    content = mainMatch[1];
  } else {
    // Try article tag
    const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = articleMatch[1];
    }
  }

  // Remove all HTML tags
  content = content.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  content = decodeHtmlEntities(content);

  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim();

  return content || null;
}

// Extract structured data (JSON-LD)
export function extractStructuredData(html: string): Record<string, unknown>[] {
  const data: Record<string, unknown>[] = [];
  const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        data.push(...parsed);
      } else {
        data.push(parsed);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return data;
}

// Extract images
export function extractImages(html: string): Array<{ src: string; alt: string }> {
  const images: Array<{ src: string; alt: string }> = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    images.push({
      src: match[1],
      alt: match[2] || '',
    });
  }

  return images;
}

// Full content extraction
export function extractContent(html: string): ExtractedContent {
  return {
    title: extractTitle(html),
    description: extractDescription(html),
    headings: extractHeadings(html),
    paragraphs: extractParagraphs(html),
    links: extractLinksWithText(html),
    images: extractImages(html),
    metadata: extractMetadata(html),
    mainContent: extractMainContent(html),
    structuredData: extractStructuredData(html),
  };
}

// Helper: Extract paragraphs
function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([^<]+(?:<[^>]+>[^<]+)*)<\/p>/gi;
  let match;

  while ((match = pRegex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 20) {
      paragraphs.push(decodeHtmlEntities(text));
    }
  }

  return paragraphs;
}

// Helper: Extract links with text
function extractLinksWithText(html: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    links.push({
      href: match[1],
      text: decodeHtmlEntities(match[2].trim()),
    });
  }

  return links;
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'gi'), char);
  }

  // Decode numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return decoded;
}

// Education-specific content detection
export function isEducationPage(html: string): boolean {
  const educationKeywords = [
    'university',
    'college',
    'campus',
    'faculty',
    'admission',
    'enrollment',
    'tuition',
    'degree',
    'major',
    'program',
    'course',
    'semester',
    'academic',
    'student',
    'professor',
    'research',
    'scholarship',
  ];

  const lowerHtml = html.toLowerCase();
  const matchCount = educationKeywords.filter((kw) => lowerHtml.includes(kw)).length;

  return matchCount >= 3;
}

// Page type detection
export function detectPageType(url: string, html: string): string {
  const lowerUrl = url.toLowerCase();
  const lowerHtml = html.toLowerCase();

  if (lowerUrl.includes('/admission') || lowerHtml.includes('apply now')) {
    return 'admissions';
  }
  if (lowerUrl.includes('/program') || lowerUrl.includes('/major') || lowerUrl.includes('/degree')) {
    return 'program';
  }
  if (lowerUrl.includes('/faculty') || lowerUrl.includes('/staff') || lowerUrl.includes('/directory')) {
    return 'directory';
  }
  if (lowerUrl.includes('/news') || lowerUrl.includes('/article')) {
    return 'news';
  }
  if (lowerUrl.includes('/event') || lowerUrl.includes('/calendar')) {
    return 'events';
  }
  if (lowerUrl.includes('/research') || lowerUrl.includes('/publication')) {
    return 'research';
  }
  if (lowerUrl.includes('/about')) {
    return 'about';
  }
  if (lowerUrl.includes('/contact')) {
    return 'contact';
  }

  return 'general';
}
