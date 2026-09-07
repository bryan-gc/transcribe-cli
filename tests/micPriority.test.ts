import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMicDevice, type MicDevice } from '../src/audio/micDevices.js';
import { DEFAULT_DEVICE_ID, DEFAULT_DEVICE_LABEL } from '../src/constants.js';

const DEFAULT: MicDevice = { id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL };
const RAZER: MicDevice = { id: 'alsa_input.usb-Razer', label: 'Razer Seiren V2 Pro' };
const BRIO: MicDevice = { id: 'alsa_input.usb-Logitech', label: 'Logitech BRIO' };

test('the first connected microphone in the list wins', () => {
  const { device, isFallback } = resolveMicDevice([RAZER.id, BRIO.id], [DEFAULT, RAZER, BRIO]);
  assert.deepEqual(device, RAZER);
  assert.equal(isFallback, false, 'the preferred one was available');
});

test('an unplugged first choice falls through to the next', () => {
  const { device, isFallback } = resolveMicDevice([RAZER.id, BRIO.id], [DEFAULT, BRIO]);
  assert.deepEqual(device, BRIO);
  assert.equal(isFallback, true, 'so the interface can say which one it settled for');
});

test('a list where nothing is connected falls back to the system default', () => {
  const { device, isFallback } = resolveMicDevice([RAZER.id, BRIO.id], [DEFAULT]);
  assert.deepEqual(device, DEFAULT);
  assert.equal(isFallback, true);
});

test('an empty list takes the system default without calling it a fallback', () => {
  const { device, isFallback } = resolveMicDevice([], [DEFAULT, RAZER]);
  assert.deepEqual(device, DEFAULT);
  assert.equal(isFallback, false, 'nothing was preferred, so nothing was missed');
});

test('no devices at all still yields the default rather than undefined', () => {
  const { device } = resolveMicDevice([RAZER.id], []);
  assert.equal(device.id, DEFAULT_DEVICE_ID);
});

test('order in the list is what decides, not order of detection', () => {
  const { device } = resolveMicDevice([BRIO.id, RAZER.id], [DEFAULT, RAZER, BRIO]);
  assert.deepEqual(device, BRIO);
});

test('the label comes from the detected device, not from what was saved', () => {
  const renamed = { id: RAZER.id, label: 'Razer Seiren V2 Pro (USB)' };
  const { device } = resolveMicDevice([RAZER.id], [DEFAULT, renamed]);
  assert.equal(device.label, 'Razer Seiren V2 Pro (USB)');
});
