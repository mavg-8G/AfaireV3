import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function tokens(start: string) {
  const open = css.indexOf("{", css.indexOf(start)); assert.ok(open > 0, `Falta el bloque ${start}`);
  const body = css.slice(open + 1, css.indexOf("}", open));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(match => [match[1], match[2]]));
}

const channel = (hex: string, at: number) => { const value = parseInt(hex.slice(at, at + 2), 16) / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => 0.2126 * channel(hex.slice(1), 0) + 0.7152 * channel(hex.slice(1), 2) + 0.0722 * channel(hex.slice(1), 4);
const ratio = (a: string, b: string) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

// Foreground, background, minimum ratio. Text pairs the UI actually renders; WCAG AA is 4.5 (3 for large text).
const pairs: [string, string, number][] = [
  ["ink", "paper", 4.5], ["ink", "card", 4.5], ["muted", "paper", 4.5], ["muted", "card", 4.5], ["muted", "sunken", 4.5],
  ["sage", "paper", 4.5], ["sage", "card", 4.5], ["on-accent", "sage", 4.5], ["on-hero", "hero", 4.5],
  ["fixed", "fixed-soft", 4.5], ["sage", "sage-soft", 4.5], ["amber", "amber-soft", 4.5], ["amber", "card", 4.5],
  ["terracotta", "card", 4.5], ["terracotta", "paper", 4.5], ["gold", "card", 3],
];

const themes = { light: ":root {", dark: 'html[data-theme="dark"] {', system: 'html[data-theme="system"] {' };

for (const [name, start] of Object.entries(themes)) {
  const palette = tokens(start);
  test(`${name} theme: text pairs meet contrast minimums`, () => {
    for (const [foreground, background, minimum] of pairs) {
      assert.ok(palette[foreground] && palette[background], `${name}: falta --${foreground} o --${background}`);
      const value = ratio(palette[foreground], palette[background]);
      assert.ok(value >= minimum, `${name}: --${foreground} sobre --${background} = ${value.toFixed(2)} (mínimo ${minimum})`);
    }
  });
}

test("the system dark palette matches the explicit dark palette", () => {
  const dark = tokens(themes.dark), system = tokens(themes.system);
  for (const [key, value] of Object.entries(dark)) assert.equal(system[key]?.toLowerCase(), value.toLowerCase(), `--${key} difiere entre dark y system`);
});
