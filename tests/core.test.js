import test from 'node:test';
import assert from 'node:assert/strict';
import {validateKickVodUrl,parseTimestamp,validateTimeRange,normalizeChannelName,formatPeriod} from '../src/core.js';
test('accepts a Kick VOD URL',()=>assert.equal(validateKickVodUrl('https://kick.com/streamer/videos/abc').valid,true));
test('rejects invalid hosts and paths',()=>{assert.equal(validateKickVodUrl('https://example.com/streamer/videos/abc').valid,false);assert.equal(validateKickVodUrl('https://kick.com/streamer').valid,false);assert.equal(validateKickVodUrl('').valid,false)});
test('parses timestamps safely',()=>{assert.equal(parseTimestamp('01:02:03'),3723);assert.equal(parseTimestamp('00:60:00'),null);assert.equal(parseTimestamp('2:03'),null)});
test('requires end time after start',()=>{assert.equal(validateTimeRange('00:02:00','00:05:00').durationSeconds,180);assert.equal(validateTimeRange('00:05:00','00:02:00').valid,false)});
test('normalizes channel names',()=>{assert.deepEqual(normalizeChannelName('@Soy_Pan'),{valid:true,name:'soy_pan'});assert.equal(normalizeChannelName('bad name').valid,false)});
test('formats monthly and yearly periods',()=>{assert.match(formatPeriod('2026-10'),/OCT 2026/);assert.equal(formatPeriod('2026','year'),'2026');assert.equal(formatPeriod('2026-13'),'PERIODO')});
