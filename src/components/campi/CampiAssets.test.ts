import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('Campi authored frame resources', () => {
  it.each(['rest', 'blink', 'wave', 'wave2', 'smile', 'curious', 'surprised', 'wink', 'angry', 'sad', 'celebrate', 'flight', 'run', 'run2'])('%s is an aligned transparent PNG', pose => {
    const png = readFileSync(`public/campi/campi-${pose}.png`);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1122);
    expect(png.readUInt32BE(20)).toBe(1402);
    expect(png[25]).toBe(6); // RGBA; every pose supports the overlay background.
    const webp = readFileSync(`public/campi/campi-${pose}.webp`);
    expect(webp.subarray(0, 4).toString()).toBe('RIFF');
    expect(webp.subarray(8, 12).toString()).toBe('WEBP');
    expect(webp.byteLength).toBeLessThan(250 * 1024);
  });
});
