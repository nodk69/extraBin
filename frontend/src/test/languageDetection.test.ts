import { describe, it, expect } from 'vitest';
import {
  detectLanguageFromCode,
  detectLanguageFromFilename,
  getPrimaryExtensionForLanguage,
  updateFilenameExtension,
  normalizeLanguageId,
} from '../lib/syntax/languageDetection';

describe('Language Detection Pipeline', () => {
  describe('detectLanguageFromCode', () => {
    it('detects Bash scripts with shebangs or shell keywords', () => {
      const bash1 = `#!/bin/bash
echo "Deploying ExtraBin service..."
export NODE_ENV=production
if [ -f /etc/config.json ]; then
  echo "Found config"
fi
`;
      expect(detectLanguageFromCode(bash1)).toBe('bash');

      const bash2 = `#!/usr/bin/env bash
for i in {1..5}; do
  echo "Worker $i"
done
`;
      expect(detectLanguageFromCode(bash2)).toBe('bash');

      const bash3 = `
chmod +x ./build.sh
sudo apt update && sudo apt install -y curl
curl -sSL https://get.docker.com | sh
`;
      expect(detectLanguageFromCode(bash3)).toBe('bash');
    });

    it('detects C programs accurately', () => {
      const cCode = `
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char** argv) {
    printf("Starting ExtraBin C core engine\\n");
    char* buffer = (char*)malloc(1024);
    if (!buffer) return 1;
    free(buffer);
    return 0;
}
`;
      expect(detectLanguageFromCode(cCode)).toBe('c');
    });

    it('detects C++ programs accurately and differentiates from C', () => {
      const cppCode1 = `
#include <iostream>
#include <vector>
#include <string>

int main() {
    std::cout << "Starting ExtraBin C++ cluster" << std::endl;
    std::vector<std::string> nodes = {"alpha", "beta"};
    return 0;
}
`;
      expect(detectLanguageFromCode(cppCode1)).toBe('cpp');

      const cppCode2 = `
template <typename T>
class SafeBuffer {
public:
    SafeBuffer(size_t cap) : capacity(cap), data(nullptr) {}
private:
    size_t capacity;
    T* data;
};
`;
      expect(detectLanguageFromCode(cppCode2)).toBe('cpp');
    });

    it('detects Java correctly', () => {
      const javaCode = `
package com.pastebin.service;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TrendingService {
    public static void main(String[] args) {
        System.out.println("ExtraBin Java Service");
    }
}
`;
      expect(detectLanguageFromCode(javaCode)).toBe('java');
    });

    it('detects JavaScript and TypeScript correctly', () => {
      const jsCode = `
import React, { useState } from 'react';

export default function PasteViewer() {
  const [data, setData] = useState(null);
  console.log("Rendering component");
  return <div>Viewer</div>;
}
`;
      expect(detectLanguageFromCode(jsCode)).toBe('javascript');

      const tsCode = `
interface PastePayload {
  id: string;
  views: number;
  tags: string[];
}

export const fetchPaste = async (id: string): Promise<PastePayload> => {
  const res = await fetch(\`/api/v1/pastes/\${id}\`);
  return res.json();
};
`;
      expect(detectLanguageFromCode(tsCode)).toBe('typescript');
    });

    it('detects Python correctly', () => {
      const pyCode = `
import os
import sys

def calculate_trending_score(views: int, decay: float):
    if __name__ == '__main__':
        print("Calculating score...")
    return views * decay
`;
      expect(detectLanguageFromCode(pyCode)).toBe('python');
    });

    it('detects SQL correctly', () => {
      const sqlCode = `
SELECT id, title, view_count, created_at
FROM pastes
WHERE visibility = 'PUBLIC' AND is_deleted = false
ORDER BY view_count DESC
LIMIT 50;
`;
      expect(detectLanguageFromCode(sqlCode)).toBe('sql');
    });

    it('detects JSON and YAML correctly', () => {
      const jsonCode = `
{
  "name": "extraBin",
  "version": "2.4.0",
  "features": ["multi-file", "syntax-highlighting", "e2ee"]
}
`;
      expect(detectLanguageFromCode(jsonCode)).toBe('json');

      const yamlCode = `
version: '3.8'
services:
  app:
    image: extrabin:latest
    ports:
      - "8080:8080"
`;
      expect(detectLanguageFromCode(yamlCode)).toBe('yaml');
    });

    it('detects HTML and CSS correctly', () => {
      const htmlCode = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ExtraBin Paste</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`;
      expect(detectLanguageFromCode(htmlCode)).toBe('html');

      const cssCode = `
.editor-surface {
  display: flex;
  background: #141c19;
  color: #eff2eb;
  font-size: 14px;
}
`;
      expect(detectLanguageFromCode(cssCode)).toBe('css');
    });

    it('detects Go and Rust correctly', () => {
      const goCode = `
package main

import "fmt"

func main() {
    fmt.Println("ExtraBin High-Throughput Go Ingestion Service")
}
`;
      expect(detectLanguageFromCode(goCode)).toBe('go');

      const rustCode = `
fn main() {
    let mut counter = 0;
    println!("Rust telemetry engine: {}", counter);
}
`;
      expect(detectLanguageFromCode(rustCode)).toBe('rust');
    });

    it('returns null for plain English text or ambiguous non-code', () => {
      const text = "Hello team, please find the meeting notes from yesterday afternoon attached below.";
      expect(detectLanguageFromCode(text)).toBeNull();

      const shortSnippet = "var a;";
      expect(detectLanguageFromCode(shortSnippet)).toBeNull();
    });
  });

  describe('detectLanguageFromFilename', () => {
    it('infers languages from audited extensions', () => {
      expect(detectLanguageFromFilename('deploy.sh')).toBe('bash');
      expect(detectLanguageFromFilename('main.c')).toBe('c');
      expect(detectLanguageFromFilename('core.cpp')).toBe('cpp');
      expect(detectLanguageFromFilename('Service.java')).toBe('java');
      expect(detectLanguageFromFilename('app.js')).toBe('javascript');
      expect(detectLanguageFromFilename('types.ts')).toBe('typescript');
      expect(detectLanguageFromFilename('script.py')).toBe('python');
      expect(detectLanguageFromFilename('query.sql')).toBe('sql');
      expect(detectLanguageFromFilename('data.json')).toBe('json');
      expect(detectLanguageFromFilename('config.yaml')).toBe('yaml');
      expect(detectLanguageFromFilename('config.yml')).toBe('yaml');
      expect(detectLanguageFromFilename('index.html')).toBe('html');
      expect(detectLanguageFromFilename('styles.css')).toBe('css');
      expect(detectLanguageFromFilename('main.go')).toBe('go');
      expect(detectLanguageFromFilename('lib.rs')).toBe('rust');
      expect(detectLanguageFromFilename('README.md')).toBe('markdown');
    });

    it('handles special filenames', () => {
      expect(detectLanguageFromFilename('Dockerfile')).toBe('bash');
      expect(detectLanguageFromFilename('Makefile')).toBe('bash');
      expect(detectLanguageFromFilename('.bashrc')).toBe('bash');
    });

    it('returns null for filenames without known extensions', () => {
      expect(detectLanguageFromFilename('notes')).toBeNull();
      expect(detectLanguageFromFilename('archive.tar.gz')).toBeNull();
    });
  });

  describe('updateFilenameExtension', () => {
    it('updates auto-managed filename extension when language changes', () => {
      expect(updateFilenameExtension('main.js', 'python')).toBe('main.py');
      expect(updateFilenameExtension('main.js', 'cpp')).toBe('main.cpp');
      expect(updateFilenameExtension('main.js', 'c')).toBe('main.c');
      expect(updateFilenameExtension('main.cpp', 'c')).toBe('main.c');
      expect(updateFilenameExtension('main.c', 'cpp')).toBe('main.cpp');
      expect(updateFilenameExtension('script.py', 'bash')).toBe('script.sh');
      expect(updateFilenameExtension('file_1.txt', 'java')).toBe('file_1.java');
      expect(updateFilenameExtension('file_1.txt', 'sql')).toBe('file_1.sql');
    });

    it('handles filenames without dots or dotfiles safely', () => {
      expect(updateFilenameExtension('myscript', 'python')).toBe('myscript.py');
      expect(updateFilenameExtension('', 'javascript')).toBe('main.js');
      expect(updateFilenameExtension('.env', 'yaml')).toBe('.env.yaml');
    });
  });

  describe('normalizeLanguageId and extensions', () => {
    it('maps aliases to canonical IDs', () => {
      expect(normalizeLanguageId('c++')).toBe('cpp');
      expect(normalizeLanguageId('shell')).toBe('bash');
      expect(normalizeLanguageId('sh')).toBe('bash');
      expect(normalizeLanguageId('py')).toBe('python');
      expect(normalizeLanguageId('js')).toBe('javascript');
      expect(normalizeLanguageId('ts')).toBe('typescript');
      expect(normalizeLanguageId('c#')).toBe('csharp');
      expect(normalizeLanguageId('unknown-lang')).toBe('plaintext');
    });

    it('returns primary extensions for languages', () => {
      expect(getPrimaryExtensionForLanguage('python')).toBe('py');
      expect(getPrimaryExtensionForLanguage('javascript')).toBe('js');
      expect(getPrimaryExtensionForLanguage('typescript')).toBe('ts');
      expect(getPrimaryExtensionForLanguage('cpp')).toBe('cpp');
      expect(getPrimaryExtensionForLanguage('c')).toBe('c');
      expect(getPrimaryExtensionForLanguage('bash')).toBe('sh');
    });
  });
});
