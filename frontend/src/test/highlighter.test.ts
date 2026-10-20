import { describe, it, expect } from 'vitest';
import { highlightCode, highlightCodeToLines, detectLanguageFromCode } from '../lib/syntax/highlighter';


describe('highlighter', () => {
  it('highlights java code with tokens', () => {
    const code = 'public class HelloWorld { public static void main(String[] args) {} }';
    const html = highlightCode(code, 'java');
    expect(html).toContain('token');
    expect(html).toContain('class-name');
  });

  it('highlights javascript code with tokens', () => {
    const code = 'const x = 42; console.log(x);';
    const html = highlightCode(code, 'javascript');
    expect(html).toContain('token');
    expect(html).toContain('keyword');
  });

  it('highlights html code with tokens', () => {
    const code = '<div class="test">Hello</div>';
    const html = highlightCode(code, 'html');
    expect(html).toContain('token');
    expect(html).toContain('tag');
  });

  it('highlights multi-line java into lines preserving tokens', () => {
    const code = `public class HelloWorld {
  /* multi-line
     comment */
  public static void main(String[] args) {
    System.out.println("Hello");
  }
}`;
    const lines = highlightCodeToLines(code, 'java');
    expect(lines.length).toBe(7);
    expect(lines[0]).toContain('token keyword');
    expect(lines[1]).toContain('token comment');
    expect(lines[2]).toContain('token comment');
  });

  it('detects java correctly', () => {
    const detected = detectLanguageFromCode('public class Foo { public static void main(String[] args) {} }');
    expect(detected).toBe('java');
  });
});
