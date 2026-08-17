# dsh-quiz

面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) Web UI 的对话式题库插件。它可以把 AI 回答转换成单选题、多选题或判断题，让用户即时作答、查看解析，并自主决定是否加入个人题库与复习列表。

**关键词：** DeepSeek Harness plugin、DSH plugin、AI quiz、对话学习、题库、知识复习。

## 功能

- 在每条已完成的 AI 回答下方显示“出题”按钮。
- 支持单选题、多选题、判断题和混合题。
- 可选择题目数量与难度。
- 使用原生单选框和复选框作答，提交后即时判题并显示解析。
- 题目默认只是临时草稿，只有用户明确操作后才会加入题库。
- “加入题库”和“加入复习”相互独立，不会自动安排复习。
- 左侧题库入口支持关键词搜索、待复习筛选和历史作答统计。
- 每道题保留来源会话及回答摘录，方便回到知识上下文。
- 题目数据写入 DSH domain storage；未保存草稿不会长期占用存储。

## 适用场景

- 将零散的 AI 问答变成可检验的学习材料。
- 阅读技术解释后立即进行理解检查。
- 从日常对话中逐步积累个人题库。
- 保存容易答错的题目，供之后主动复习。

## 要求

- DeepSeek Harness `0.1.x` Web profile
- Node.js `^22.19` 或 `>=24`
- pnpm
- 已在 DSH 中配置可用的模型服务

当前插件版本基于 DSH `0.1.0-rc.6` API 构建。DSH 尚处于预发布阶段，升级 DSH 后如遇兼容问题，请先重新安装插件并查看仓库 Issues。

## 安装

### 推荐：从 GitHub 安装

无需预先全局安装 `dsh` 命令。进入任意目录后运行：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:cungphammanh590-star/dsh-quiz
npx @deepseek-ai/dsh web
```

GitHub 安装会执行仓库的 `prepare` 构建脚本。pnpm 10 及更高版本默认可能阻止 Git 依赖执行构建；首次安装失败时，请按照 DSH 在终端给出的提示，把 `dsh-quiz` 加入对应 Web profile 的 `pnpm-workspace.yaml` 中的 `allowBuilds`，然后重新运行安装命令。只应为你信任的插件源码授予构建权限。

### 从本地源码安装

`.` 表示运行命令时所在的插件目录，因此以下命令必须在克隆后的 `dsh-quiz` 目录执行：

```sh
git clone https://github.com/cungphammanh590-star/dsh-quiz.git
cd dsh-quiz
pnpm install
pnpm run verify
npx @deepseek-ai/dsh plugin --profile web add .
npx @deepseek-ai/dsh web
```

### 从 tarball 安装

```sh
pnpm install
pnpm pack
npx @deepseek-ai/dsh plugin --profile web add ./dsh-quiz-0.1.1.tgz
npx @deepseek-ai/dsh web
```

### 使用 DeepSeek Harness 源码仓库

如果你已经克隆并构建了 DeepSeek Harness，可以从 Harness 仓库运行它的 `pnpm dsh` 脚本。安装独立插件时使用插件的绝对路径：

```sh
cd /path/to/deepseek-harness
pnpm install
pnpm run build
pnpm dsh plugin --profile web add /absolute/path/to/dsh-quiz
pnpm dsh web
```

插件不需要复制进 DeepSeek Harness 仓库。DSH 会把独立插件安装到指定 profile，并加载插件声明的 `cordis.patch.yml`。

### 为什么终端提示 `command not found: dsh`

裸 `dsh ...` 命令只适用于已经把 DSH CLI 全局安装到 `PATH` 的环境。普通用户请使用 `npx @deepseek-ai/dsh ...`；从 DeepSeek Harness 源码运行时请使用 `pnpm dsh ...`。

安装后刷新 DSH Web 页面。左侧出现“题库”入口，并且 AI 回答下方出现“出题”按钮，即表示插件已启用。

## 使用方法

1. 在 DSH Web 中提问并等待 AI 完成回答。
2. 点击回答下方的“出题”。
3. 选择题型、题量和难度，然后点击“开始出题”。
4. 使用单选框或复选框选择答案，再点击“提交答案”。
5. 查看判题结果和解析。
6. 需要保留时，可勾选“加入复习”，再点击“加入题库”。
7. 点击左侧“题库”浏览、搜索或筛选已保存题目。

也可以直接通过对话调用插件能力，例如：

```text
根据刚才关于 JavaScript 闭包的回答，给我出两道单选题，先不要显示答案。
```

```text
第一题选 B。把这道题加入题库，但暂时不要加入复习。
```

## 数据与隐私

- 已保存题目使用当前 Web profile 配置的 DSH domain storage。
- 未保存题目是有数量上限的进程内草稿；重启 DSH 后会被丢弃。
- 题目会记录生成所依据的 AI 回答摘录和来源会话 ID。
- 插件本身不提供外部同步、遥测或独立账号系统。
- 生成内容仍由当前 DSH 模型提供商处理，适用其现有配置与隐私政策。

## 模型工具

| 工具 | 作用 |
| --- | --- |
| `quiz_create_draft` | 创建 1–10 道尚未保存的题目，并关联当前 DSH 会话。 |
| `quiz_answer` | 按选项索引判题，并更新作答统计。 |
| `quiz_save` | 保存指定草稿，并独立设置是否加入复习。 |
| `quiz_list` | 按主题或复习状态查询已保存题目。 |

## 当前限制

- 已记录复习意愿，但尚未实现间隔重复或自动复习提醒。
- 出题质量依赖当前模型；保存前应检查题目与解析是否可靠。
- 已保存题目暂不支持编辑和版本历史。
- 题库目前跟随单个 DSH storage 配置，不提供跨设备同步界面。

## 故障排查

### 看不到“出题”按钮

确认插件安装到了 `web` profile，然后重启 DSH 并刷新浏览器：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:cungphammanh590-star/dsh-quiz
npx @deepseek-ai/dsh web
```

### 出题后没有生成题目

确认 DSH 已配置模型 API Key，并检查当前模型是否允许调用 `quiz_create_draft` 工具。题目必须来自已完成且仍存在于当前会话日志中的 AI 回答。

### 重启后草稿消失

这是预期行为。只有点击“加入题库”的题目会持久保存。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

运行全部本地验证：

```sh
pnpm run verify
```

## License

[MIT](LICENSE)
