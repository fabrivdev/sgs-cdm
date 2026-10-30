import { describe, expect, it } from 'vitest';
import { PANORAMA_TOPICS } from './panoramaPreferences';
import { PANORAMA_GROUP_TONES, panoramaTopicTone } from './panoramaTopicTone';

describe('Panorama topic identity colors', () => {
  it('uses the selector group palette for every selectable card', () => {
    expect(PANORAMA_TOPICS).toHaveLength(12);
    for (const topic of PANORAMA_TOPICS) {
      const tone = panoramaTopicTone(topic.id);
      expect(tone).toBe(PANORAMA_GROUP_TONES[topic.group]);
      expect(tone.selectorClass).toContain('text-');
      expect(tone.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
