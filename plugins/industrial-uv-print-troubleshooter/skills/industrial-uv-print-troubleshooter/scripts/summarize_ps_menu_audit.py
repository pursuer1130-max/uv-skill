"""Summarize local Photoshop audit artifacts without treating inventory as execution."""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

root = Path(sys.argv[1]).resolve()
tests = json.loads((root / 'tests.json').read_text(encoding='utf-8-sig'))
summary = json.loads((root / 'summary.json').read_text(encoding='utf-8-sig'))
if len(sys.argv) > 2:
    retest = Path(sys.argv[2]).resolve()
    latest = json.loads((retest / 'tests.json').read_text(encoding='utf-8-sig'))
    replacements = {(t['group'], t['name']): t for t in latest}
    tests = [dict(replacements[(t['group'], t['name'])], previous_status=t['status'], previous_error=t.get('error'))
             if (t['group'], t['name']) in replacements else t for t in tests]
    summary['elapsed_ms'] += json.loads((retest / 'summary.json').read_text(encoding='utf-8-sig'))['elapsed_ms']
    (root / 'tests-final.json').write_text(json.dumps(tests, ensure_ascii=False, indent=2), encoding='utf-8')
menus = json.loads((root / 'menus-rgb-document.json').read_text(encoding='utf-8-sig'))
rows = []

def walk(items, path=()):
    for item in items:
        label = item.get('title') or item.get('name') or str(item.get('command', ''))
        here = path + (label,)
        children = item.get('submenu', [])
        rows.append({'path': ' > '.join(here), 'command': item.get('command'),
                     'kind': item.get('kind'), 'enabled_during_script': item.get('enabled'),
                     'visible': item.get('visible'), 'leaf': not bool(children),
                     'execution': 'Not individually tested by this inventory'})
        walk(children, here)

walk(menus['menuBarInfo']['submenu'])
with (root / 'menu-inventory.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
counts = Counter(t['status'] for t in tests)
groups = {}
for test in tests:
    groups.setdefault(test['group'], Counter())[test['status']] += 1
lines = ['# Photoshop 菜单功能测试报告', '',
         f"Photoshop {summary['version']}；批量测试耗时 {summary['elapsed_ms'] / 1000:.1f} 秒。", '',
         f"已读取 {len(menus['menuBarInfo']['submenu'])} 个顶层菜单、{len(rows)} 条菜单记录，其中 {sum(r['leaf'] for r in rows)} 条叶级记录。", '',
         f"实际执行 {len(tests)} 项文档操作：{counts['verified']} 项验证通过，{counts['failed']} 项测试未通过、需复核。", '',
         '**范围说明：菜单目录已遍历，不等于全部菜单功能已执行。** 测试通过表示脚本/API 的结果满足断言，不等于鼠标点击路径通过。菜单 enabled 字段采集于脚本运行期间，不能单独判断日常界面功能是否正常。', '',
         '| 功能组 | 验证通过 | 需复核 |', '|---|---:|---:|']
for group, status in groups.items():
    lines.append(f"| {group} | {status['verified']} | {status['failed']} |")
lines += ['', '## 需复核项目', '']
for test in tests:
    if test['status'] != 'verified':
        error = test.get('error', '').replace('\n', ' ')
        lines.append(f"- {test['group']} / {test['name']}: {error}")
if not counts['failed']:
    lines.append('本批次没有失败项。')
lines += ['', '## 未执行项目', '',
          '实际打印、退出、账户和网络帮助、第三方交互插件、外部设备采集、3D、视频、持久首选项，以及测试清单未列出的上下文命令。本报告不把这些项目计为通过。', '',
          '测试只创建和关闭自有临时文档。PSD、TIFF、PNG、JPEG、BMP 和网页 PNG 导出样本保存在此文件夹。', '',
          '完整菜单：menu-inventory.csv；逐项结果：tests.json；原始目录：menus-original-context.json 和 menus-rgb-document.json。']
if len(sys.argv) > 2:
    lines += ['', f'失败项重测目录：{retest}；合并结果：tests-final.json。原始失败记录保留，没有覆盖。']
(root / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps({'folder': str(root), 'menu_records': len(rows), 'leaf_records': sum(r['leaf'] for r in rows),
                  'tests': len(tests), 'counts': dict(counts), 'seconds': round(summary['elapsed_ms']/1000, 1)}, ensure_ascii=False))
