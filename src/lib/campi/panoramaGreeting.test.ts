import { describe, expect, it } from 'vitest';
import { panoramaGreetingName } from './panoramaGreeting';

describe('Panorama greeting name', () => {
  it('uses only the visible name of the current authenticated profile', () => {
    expect(panoramaGreetingName('a', { id: 'a', nombre: '  Ana Pérez  ' })).toBe('Ana Pérez');
    expect(panoramaGreetingName('a', { id: 'profile-a', auth_user_id: 'a', nombre: 'Ana' })).toBe('Ana');
  });
  it('falls back without exposing a stale profile during a user change', () => {
    expect(panoramaGreetingName('b', { id: 'a', nombre: 'Ana' })).toBe('Usuario');
    expect(panoramaGreetingName('a', { id: 'a', nombre: '   ' })).toBe('Usuario');
    expect(panoramaGreetingName('a', null)).toBe('Usuario');
    expect(panoramaGreetingName('', { id: 'a', nombre: 'Ana' })).toBe('Usuario');
  });
});
