import test from 'node:test';
import assert from 'node:assert/strict';
import { locale, setLocale, t, translateText, formatNumber, formatDate } from '../site/i18n.js';

test('English interface phrases and explicit templates preserve dynamic values', () => {
  setLocale('en');
  assert.equal(locale(), 'en');
  assert.equal(translateText('登录'), 'Sign in');
  assert.equal(translateText('  第 12 组 · 匿名  '), '  Pair 12 · Anonymous  ');
  assert.equal(t('可盲评 {count} 件', { count: 7 }), '7 eligible works');
  assert.equal(translateText('加入展厅：模型原名'), 'Add to exhibition: 模型原名');
  assert.equal(translateText('在线预览：A  B，Claude'), 'Preview: A  B, Claude');
  assert.equal(translateText('可盲评 1 件'), '1 eligible work');
  assert.equal(translateText('· 本次已计入 1 组'), '· 1 pair counted this session');
  assert.equal(translateText('· 本次已计入 2 组'), '· 2 pairs counted this session');
});

test('copy is matched as a whole phrase and Chinese switches back without changing content', () => {
  setLocale('en');
  assert.equal(translateText('作品原文中包含登录两个字'), '作品原文中包含登录两个字');
  assert.equal(translateText('<script>登录</script>'), '<script>登录</script>');
  setLocale('zh-CN');
  assert.equal(t('可盲评 {count} 件', { count: 7 }), '可盲评 7 件');
  assert.equal(translateText('登录'), '登录');
  setLocale('unsupported');
  assert.equal(locale(), 'zh-CN');
});

test('formatting follows the selected locale', () => {
  setLocale('en');
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatDate('2026-10-11T12:00:00'), new Date('2026-10-11T12:00:00').toLocaleDateString('en', { year: 'numeric', month: '2-digit', day: '2-digit' }));
  setLocale('zh-CN');
  assert.equal(formatDate('2026-10-11T12:00:00'), new Date('2026-10-11T12:00:00').toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }));
});
