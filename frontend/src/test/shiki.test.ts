import { describe, it, expect } from 'vitest';
import { codeToHtml } from 'shiki';

export function extractShikiLines(html: string): string[] {
  const codeMatch = html.match(/<code>([\s\S]*?)<\/code>/);
  if (!codeMatch) return html.split('\n');

  const lines = codeMatch[1].split('\n');
  return lines.map((line) => {
    return line.replace(/^<span class="line">/, '').replace(/<\/span>$/, '');
  });
}

describe('shiki extraction', () => {
  it('extracts each line accurately with inline styles', async () => {
    const code = `public class HelloWorld {
    // Greets
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`;
    const html = await codeToHtml(code, {
      lang: 'java',
      theme: 'tokyo-night',
    });
    const lines = extractShikiLines(html);
    expect(lines.length).toBe(6);
    expect(lines[0]).toContain('HelloWorld');
    expect(lines[0]).toContain('style="color:#');
    expect(lines[1]).toContain('// Greets');
    expect(lines[3]).toContain('Hello');
  });
});
