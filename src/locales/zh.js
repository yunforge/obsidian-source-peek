'use strict';

// 简体中文。键名与 en.js 一一对应；缺哪个键就回退到英文，不会留空。

module.exports = {
  // 命令与提示
  'cmd.toggle': '切换悬停预览',
  'notice.on': '悬停预览已开启',
  'notice.off': '悬停预览已关闭',

  // 预览面板
  'preview.error.fetch': '获取失败：{error}',
  'preview.error.noPath': '没有可读取的路径',
  'preview.error.nothingAtLine': '第 {line} 行没有可显示的内容 —— 文件不存在、行数不足或无法读取。',
  'preview.error.load': '加载失败：{error}',
  'preview.note.headingMiss': '该页面没有「{heading}」这个标题。',
  'preview.note.empty': '该页面没有可读内容。',
  'preview.note.truncated': { other: '只显示前 {n} 个内容块。' },
  'preview.note.truncatedLines': { other: '只显示前 {n} 行。' },

  // 设置
  'settings.enabled.name': '悬停时预览',
  'settings.enabled.desc': '把指针停在链接上，预览它指向的内容。',
  'settings.modifier.name': '按住时显示预览',
  'settings.modifier.desc': '悬停时需按住的键。Ctrl 与 Obsidian 自带的悬浮预览一致。选择「只需悬停」则不必按键。',
  'settings.modifier.ctrl': 'Ctrl',
  'settings.modifier.shift': 'Shift',
  'settings.modifier.alt': 'Alt',
  'settings.modifier.none': '只需悬停',
  'settings.modifier.custom': '自定义…',
  'settings.modifier.customDesc': '需要同时按住的按键组合。',
  'settings.modifier.customEmptyHint': '三个键都未打开，预览将等待 Ctrl（默认键）——请打开其中一个，或改选「只需悬停」。',
  'settings.modifier.noneHint': '现在指针停在链接上就会直接显示预览。',

  // 设置页里的语法说明
  'settings.help.code': '链接源代码的某一行，或某几行：',
  'settings.help.repo': '仓库里的文件同理：',
  'settings.help.web': '网页链接默认显示整个正文。# 之后写标题可缩小范围，连字符决定取哪一段：',
  'settings.help.webForms': 'page#install  该标题及其下属内容 · page#-#install  从页首到该标题 · page#install-usage  从标题1到标题2（不含标题2） · page#install-  该标题到页尾',
  'settings.help.note': '代码链接必须带行号（#L18）。GitHub 与 GitLab 的 blob 链接按代码处理，其余网页链接按页面处理。',
};
