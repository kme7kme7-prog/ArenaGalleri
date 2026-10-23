// Exact interface phrases. User content and audit text are excluded at their DOM boundaries.
const phrases = Object.fromEntries(`
每 10 分钟更新一次|Updates every 10 minutes
最近计算|Last calculated
显示作品少于 5 件的条目|Show entries with fewer than 5 works
已隐藏 {value} 个作品不足 5 件的条目|Hidden {value} entries with fewer than 5 works
当前没有作品数达到 5 件的条目|No entries currently have at least 5 works
勾选「显示作品少于 5 件的条目」可查看已有评分，暂定标记仍保留。|Select “Show entries with fewer than 5 works” to view existing ratings. Provisional labels are retained.
默认隐藏当前榜单作品少于 5 件的条目，可勾选显示。评分和名次保留，「暂定」仍按比较次数标记。|Entries with fewer than 5 works in the current ranking are hidden by default. Select the option to show them. Scores and ranks are retained; provisional labels still depend on comparison counts.
更新|Updates
每 10 分钟计算一次，新投票将在下一次更新时计入。|Rankings are calculated every 10 minutes. New votes appear in the next update.
列表分页|List pagination
上一页|Previous
下一页|Next
全选当前页|Select this page
全选当前页可管理的作品|Select manageable works on this page
重试加载|Retry loading
审核列表加载超时，请重试。|The review list timed out. Please retry.
详情加载超时，请重试。|The details timed out. Please retry.
个人内容加载超时，请重试。|Your content took too long to load. Please retry.
账户|Account
账号|Account
用户名|Username
昵称|Display name
密码|Password
邮箱|Email
验证码|Verification code
登录|Sign in
注册|Sign up
注册账号|Create account
注册并登录|Create account and sign in
登录 / 注册|Sign in / Sign up
退出登录|Sign out
已退出登录|Signed out
忘记密码？|Forgot password?
找回密码|Reset password
新密码|New password
确认新密码|Confirm new password
重置密码|Reset password
验证，继续|Verify and continue
两次输入的密码不一致。|The passwords do not match.
密码已重置，请用新密码登录|Password reset. Sign in with your new password.
请填写账号。|Enter your username.
至少 8 位|At least 8 characters
6 位数字|6 digits
2–24 位中文、字母、数字或下划线|2–24 Chinese characters, letters, numbers or underscores
还没有账号？|New here?
已有账号？|Already have an account?
发送验证码|Send code
绑定邮箱|Link email
更换绑定邮箱|Change email
确认绑定|Link email
确认更换|Confirm change
邮箱绑定成功|Email linked
绑定邮箱已更换|Email changed
验证新邮箱后，原邮箱自动解除绑定。|Verifying the new email will unlink your previous address.
邮箱用于找回密码与账号安全验证。|Your email is used for password recovery and account security.
验证码 10 分钟内有效。|The code expires in 10 minutes.
验证通过，请设置新密码。重置后，所有设备都需要重新登录。|Verified. Set a new password. All devices will need to sign in again.
如果该账号绑定了邮箱，验证码已发送到该邮箱。|If this account has a linked email, a code has been sent to it.
请填写邮箱，注册需要绑定邮箱。|Enter an email address to create your account.
请先发送并填写邮箱验证码。|Request a code and enter it first.
请先完成人机验证。|Complete the human verification first.
人机验证加载失败，请稍后重试。|Human verification failed to load. Try again shortly.
人机验证加载失败，请检查网络后重试。|Human verification failed to load. Check your connection and try again.
人机验证加载失败，请刷新页面重试。|Human verification failed to load. Refresh and try again.
人机验证已过期，正在重新获取。|Human verification expired. Requesting a new challenge.
人机验证暂时失败，请稍候重试。|Human verification temporarily failed. Try again shortly.
人机验证无法显示，请刷新页面后重试。|Human verification could not be displayed. Refresh and try again.
连接超时，请重试。|Connection timed out. Try again.
连接失败，请检查网络后重试。|Connection failed. Check your network and try again.
访问较频繁，请稍后再试。|Too many requests. Try again shortly.
服务暂时不可用，请稍后重试。|Service temporarily unavailable. Try again shortly.
网络连接失败，请稍后再试|Network connection failed. Try again shortly.
请求失败（{value}）|Request failed ({value})
账户暂未连上，请重新连接后再试。|Your account is not connected. Reconnect and try again.
正在连接账户|Connecting account
账户连接暂不可用，重新连接|Account connection unavailable. Reconnect
账户连接中…|Connecting account…
账户连接中断|Account disconnected
重新连接|Reconnect
打开导航菜单|Open navigation menu
登录与菜单|Sign in and menu
平台|Platform
个人中心|My account
题库|Questions
盲评|Blind review
排行榜|Leaderboard
全量榜|Full rankings
精选榜|Curated rankings
入榜|Qualification
来源筛选后，仍须为已收录且非暂定的模型才能入榜。|After source filtering, models must still be registered and non-provisional to qualify.
入榜资格按模型判断，单独配置比较不足 30 次时仍标为暂定。|Qualification is assessed per model. Individual configurations with fewer than 30 comparisons remain provisional.
先以这些题目重算「按模型」榜，只允许已收录且非暂定的模型入榜；「按配置」沿用相同的模型资格。来源筛选后也按筛选内的模型比较数判断。有效对手的比较仍参与计分。|Model rankings are recalculated within these tasks. Only registered, non-provisional models qualify, including in configuration view. Source filters also apply to model qualification. Valid comparisons against all opponents remain in the fit.
后端尚未支持精选榜，请更新后端后重试|The backend does not support curated rankings yet. Update it and retry.
前端|Frontend
文字|Text
发起题目|Create question
审核|Review
登录后查看你发起的题目与上传的作品。|Sign in to view your questions and uploaded works.
账号需要先绑定邮箱，才能上传、发起题目和投票。|Link an email before uploading, creating questions or voting.
欢迎回来。账号还未绑定邮箱，上传和投票前需要先绑定|Welcome back. Link an email before uploading or voting.
存疑作品不能再互动|Interactions are disabled for disputed works
贴表情|Add reaction
表情加载中…|Loading reactions…
表情暂未载入|Reactions could not be loaded
登录后就可以给作品贴表情|Sign in to react to works
舔屏|Love it
太好笑|Hilarious
按一下|Give it a tap
好运来|Good luck
同意|Agreed
馋了|Want it
敲敲|Knock knock
盯|Watching
不行|Nope
关闭|Close
取消|Cancel
确认|Confirm
保存|Save
保存中…|Saving…
删除|Delete
下架|Remove
撤下|Hide
管理|Manage
编辑|Edit
详情|Details
通过|Approve
拒绝|Reject
已验证|Verified
未验证|Unverified
存疑|Disputed
已通过核验；单轮生成且无人工介入的作品可参与盲评|Verified. Works generated in one round without human intervention can enter blind review.
等待管理员核验，暂不参与盲评|Awaiting verification. Not yet eligible for blind review.
核验存疑：仅供参考，不参与互动与盲评|Verification disputed. For reference only; reactions and blind review are disabled.
在盲评池|In blind review
不进盲评|Excluded from blind review
内容审核中|Content review pending
等待人工复核|Awaiting manual review
内容未通过|Content rejected
等待人工审核|Awaiting manual review
未通过|Rejected
审核意见|Review feedback
色情|Sexual content
暴力|Violence
仇恨|Hate
诈骗|Fraud
赌博|Gambling
恶意广告|Malicious advertising
隐私|Privacy
违法伤害|Illegal harm
提示词注入|Prompt injection
其他|Other
规则命中：提示词注入|Rule matched: prompt injection
规则命中：密码输入框|Rule matched: password field
规则命中：检测自动化浏览器|Rule matched: browser automation detection
规则命中：跳转外部地址|Rule matched: external navigation
规则命中：可变 CDN|Rule matched: mutable CDN
规则命中：脚本过大未扫描|Rule matched: script too large to scan
高级管理员|Senior administrator
普通管理员|Administrator
成员|Member
可信成员|Trusted member
全部|All
题目|Questions
内容|Content
核验|Verification
已处理|Processed
记录|History
全部题目|All questions
全部作品|All works
全部成员|All members
已公开|Public
已撤下|Hidden
已拒绝|Rejected
机审拒绝|Automatically rejected
疑似注入|Suspected injection
概览|Overview
我的作品|My works
我的题目|My questions
每一道提问，每一份解答，都是你的创作足迹。|Every question and every answer is part of your creative journey.
提交作品|Submit work
通过核验|Verify
标记存疑|Mark disputed
退回未验证|Return to unverified
下架作品|Remove work
下架后处理|Follow-up after removal
审核题目|Review question
编辑题目|Edit question
重新提交题目|Resubmit question
删除题目|Delete question
内容审核|Content review
重新自动审核|Rerun automatic review
编辑信息|Edit information
调整展示设置|Change visibility
调整角色|Change role
内容审核中，通过前只有你能看到。|Content is under review. Only you can see it until approved.
等待管理员人工复核，通过前只有你能看到。|Awaiting manual review. Only you can see it until approved.
内容审核未通过，作品不会公开。可以删除后重新上传。|Content was rejected and will remain private. You can delete it and upload again.
新题目由管理员人工审核，通过前只有你能看到；附带示例结果时，它的审核进度在「我的作品」里。|New questions require manual review. Only you can see them until approved. Track any sample work under My works.
管理员正在复核，通过前只有你能看到。|An administrator is reviewing it. Only you can see it until approved.
审核未通过，题目不会公开。|The question was rejected and will remain private.
自动拒绝 · 提示词注入|Automatically rejected · Prompt injection
自动拒绝|Automatically rejected
自动审核进行中|Automatic review in progress
审核中|Under review
等待核验|Awaiting verification
存疑 / 未通过|Disputed / Rejected
自动检查内容，通常几分钟，通过前只有你能看到。|Automatic content checks usually take a few minutes. Only you can see it until approved.
管理员检查内容，通过前只有你能看到。|An administrator is checking the content. Only you can see it until approved.
题目审核|Question review
题目审核中|Question review pending
所属题目正在人工审核，通过后作品进入核验流程，届时可以编辑信息。|The question is under manual review. Once approved, the work enters verification and its information can be edited.
题目未通过|Question rejected
所属题目没有通过审核，作品不会公开。|The question was rejected, so this work will remain private.
等待管理员核对生成信息，公开展示以人工审核和展示设置为准。|Awaiting verification of generation details. Publication depends on review and visibility settings.
已撤下：展览馆和盲评都不显示|Hidden from the gallery and blind review
开启盲评|Enable blind review
已开启盲评|Blind review enabled
移出盲评|Remove from blind review
已移出盲评|Removed from blind review
公开到展览馆|Publish to gallery
已公开到展览馆|Published to gallery
恢复公开|Restore publication
已恢复公开|Publication restored
已注销的用户|Deleted account
审核内容|Review content
人工审核|Manual review
重新审核内容|Review content again
重新核验|Verify again
编辑作品信息|Edit work information
核验通过前可以修改。|You can edit this before verification.
改动文字后会重新做内容审核，审核期间作品暂不公开。|Text changes trigger a new content review. The work is hidden during review.
作品信息已保存|Work information saved
下架这件作品？|Remove this work?
作品已下架|Work removed
登录后，你上传的作品和核验结果会显示在这里。|Sign in to see your uploads and verification results here.
回到题库|Back to questions
按意见修改后可以重新提交，题目和示例结果都会保留。|Revise it based on the feedback and resubmit. The question and sample work will be retained.
这道题公开过，不能修改后重新提交。|Previously published questions cannot be revised and resubmitted.
已重新提交，管理员会对照上次意见审核。通过前只有你能看到。|Resubmitted. An administrator will review it against the previous feedback. Only you can see it until approved.
上次审核意见|Previous review feedback
查看题目|View question
修改后重新提交|Revise and resubmit
删除这道题？|Delete this question?
题目已删除|Question deleted
个人资料|Profile
更换头像|Change avatar
更换|Change
编辑昵称|Edit display name
账号绑定|Account connections
注册时绑定，用于找回密码与账号安全验证，可随时更换|Linked at registration for password recovery and account security. You can change it anytime.
正在载入…|Loading…
未绑定 · 绑定后才能上传、发起题目和投票|Not linked. Link an email to upload, create questions and vote.
绑定|Link
活跃热力图|Activity heatmap
活跃记录暂时未能载入。|Activity could not be loaded.
正在载入活跃记录…|Loading activity…
发起题目、提交作品、盲评与送出表情 · 北京时间|Questions, uploads, blind review and reactions · Beijing time
少|Less
多|More
一|Mon
三|Wed
五|Fri
日|Sun
获得的表情|Received reactions
茶壶|Teapot
兔子|Bunny
立方体|Cube
光标|Cursor
小幽灵|Ghost
甜甜圈|Donut
代码括号|Code brackets
画框|Frame
印章|Seal
月亮|Moon
机器人|Robot
猫|Cat
盆栽|Plant
灯泡|Light bulb
骰子|Dice
行星|Planet
从展馆的小住客里挑一位，它会代替你出现在菜单、个人中心和你发起的题目上。|Pick a gallery resident to represent you in the menu, your profile and your questions.
使用这个头像|Use this avatar
头像已更换|Avatar changed
上传作品|Upload work
上传到哪道题？|Which question is this for?
每件作品都对应一道题目，请按它的提示词生成后上传。|Each work answers a question. Generate it from that question's prompt before uploading.
暂时没有接受投稿的题目。|No questions are accepting uploads right now.
还没有发起题目|No questions yet
写下同一份提示词，邀请不同模型给出答案。|Write one prompt and invite different models to answer it.
昵称已保存|Display name saved
登录后上传作品，并在这里跟进核验结果。|Sign in to upload works and track verification here.
试加载|Test load
没有记录|No records
页面载入|Page load
作者提交时页面未完成载入|The page had not finished loading when submitted
脚本错误|Script errors
没有|None
资源加载|Resources
全部载入|All loaded
外部请求|External requests
没有被拦截的请求|No requests blocked
画面内容|Page content
有可见内容|Visible content found
可能是空白页面|The page may be blank
核验作品|Verify work
打开作品|Open work
在展厅中查看|View in gallery
发布者|Publisher
声明的模型|Declared model
推理档位|Reasoning level
默认 / 未设置|Default / Unspecified
服务商|Provider
未注明|Unspecified
作者原始声明|Author's original declaration
文件|Files
上次核验|Last verification
生成说明|Generation notes
作者没有填写。|The author left this blank.
上传检查|Upload checks
作者浏览器中的试加载|Test load in the author's browser
内容审核还没通过，通过后才能核验。|Content approval is required before verification.
作品信息|Work information
与上传表单一致，必填项补齐后才能通过核验|The same fields as the upload form. Complete required fields before verification.
只保存信息|Save information only
通过后公开到展览馆；单轮生成且无人工介入的作品同时进入盲评。|Approval publishes the work to the gallery. Single-round generation without human intervention also enters blind review.
娱乐作品（进竞技场收件箱）|Entertainment work (arena inbox)
勾选后不进展览馆，也不进任何池子|Excluded from the gallery and all evaluation pools when selected
存疑原因|Reason for dispute
标记存疑时必填，作者与访客都能看到|Required when marking disputed. Visible to the author and visitors.
这是你发布的作品，需要由其他管理员核验。|Another administrator must verify your own work.
信息没有改动|No information changed
标记存疑时请写明原因，作者和访客都会看到|Explain the dispute. The author and visitors will see it.
审核来源|Review source
结论|Decision
暂无|None yet
风险类别|Risk categories
未完成原因|Reason not completed
这是新题目的示例结果：题目和内容通过审核后，结果才会进入核验。|This is a sample for a new question. Verification starts after the question and content are approved.
这一步只看能否公开：违法、色情、仇恨、诈骗、恶意脚本等。作品质量和生成信息在「核验」里判断。|This step checks whether publication is allowed: illegal content, sexual content, hate, fraud, malicious scripts, etc. Quality and generation details are checked during verification.
可补充或纠正信息，内容通过后仍需核验|You can complete or correct the information. Verification is still required after content approval.
理由|Reason
拒绝时必填，作者会看到|Required for rejection. Visible to the author.
你发布的作品需要由其他管理员审核|Another administrator must review your own work
内容通过|Approve content
请写明拒绝理由|Explain the rejection
人工复核通过|Approved after manual review
已重新提交自动审核|Resubmitted for automatic review
内容已通过，转入核验|Content approved. Ready for verification
内容已通过|Content approved
内容已拒绝，作者会看到理由|Content rejected. The author can see the reason
预览结果|Preview result
标题|Title
测试简述|Test summary
题目类型|Question type
领域|Domain
完整提示词|Full prompt
上次意见|Previous feedback
本次改动|Changes in this submission
参考图、提交格式或示例结果|Reference images, submission format or sample work
没有附带示例结果。|No sample work attached.
管理作品|Manage works
待审核|Awaiting review
未公开|Private
不收投稿|Uploads closed
去审核|Go to review
通过这道题？|Approve this question?
拒绝这道题|Reject this question
会公开到题库并开放投稿。|will be published and accept uploads.
会从题库撤下，作者会看到下面的理由。|will be hidden. The author will see the reason below.
不会公开，作者会看到下面的理由。|will remain private. The author will see the reason below.
选填|Optional
请选择题目类型|Select a question type
请选择所属领域|Select a domain
题目已通过|Question approved
题目已拒绝|Question rejected
接受投稿|Accept uploads
关闭后题目照常展示，上传入口停用|When disabled, the question stays visible and uploads are closed
封面作品|Cover work
题库卡片显示这件作品|Use this work on the question card
自动（票选代表作，否则按默认规则）|Automatic (voted representative, otherwise the default rule)
保存不改变审核状态，改动会写入审核记录。|Saving keeps the review status and records the changes in review history.
标题、简述和提示词都不能为空|Title, summary and prompt are required
待核验|Awaiting verification
全部盲评状态|All evaluation states
已关闭盲评|Blind review disabled
生成方式不符|Generation method ineligible
尚不能盲评|Not eligible yet
没有待审核的题目|No questions awaiting review
没有等待人工审核内容的投稿|No uploads awaiting manual content review
没有等待核验的投稿|No uploads awaiting verification
内容已拒绝|Content rejected
内容放行后转入「核验」；新题目的示例结果等题目通过后再进入。|Approved content moves to verification. Samples for new questions wait for question approval first.
作品不会公开，作者会看到理由。|The work stays private. The author can see the reason.
已通过核验|Verified
已标记存疑|Marked disputed
通过核验即公开到展览馆，单轮生成且无人工介入的同时进入盲评。|Verification publishes the work to the gallery. Single-round generation without human intervention also enters blind review.
存疑原因对作者与访客可见。|The dispute reason is visible to the author and visitors.
已通过|Approved
公开到题库并开放投稿，沿用作者选的题目类型和领域。|Publish and accept uploads using the author's selected question type and domains.
题目不会公开，作者会看到理由。|The question stays private. The author can see the reason.
自动审核中|Automatic review pending
待人工复核|Awaiting manual review
未通过 / 未公开|Rejected / Private
尚未公开|Not published yet
已关闭|Disabled
本人作品的展示设置需由其他管理员处理|Another administrator must change visibility for your own work
通过审核并公开题目后可批量管理展示|Bulk visibility management becomes available after approval and question publication
展览馆|Gallery
没有匹配的作品|No matching works
清除筛选|Clear filters
信息、核验与展示状态分别管理|Manage information, verification and visibility separately
搜索作品、模型或发布者|Search works, models or publishers
按题目筛选|Filter by question
按盲评状态筛选|Filter by evaluation state
作品排序|Sort works
最新在前|Newest first
最早在前|Oldest first
按作品名称|By work title
没有匹配的题目|No matching questions
公开状态、投稿与作品分别管理|Manage publication, uploads and works separately
搜索题目、提示词或发布者|Search questions, prompts or publishers
按题目类型筛选|Filter by question type
全部类型|All types
按领域筛选|Filter by domain
全部领域|All domains
题目排序|Sort questions
按题目名称|By question title
作品最多|Most works
请先登录管理员账号|Sign in with an administrator account
只有管理员可以审核作品|Only administrators can review works
管理员由高级管理员授予。|Senior administrators assign administrator roles.
全选|Select all
全选可管理展示的作品|Select all works with editable visibility
还没有记录。|No records yet.
处理过的题目在|Processed questions are in
里。|.
完成后会自动转入「核验」或回到这里，也可以提前人工审核|Will move to verification or return here automatically. Manual review is also available now.
还没有核验过的作品|No verified works yet
审核分类|Review categories
待处理|Pending
所选作品的推理档位和服务商都已登记。|Reasoning levels and providers are recorded for all selected works.
留空保持各自原值|Leave blank to keep each current value
保持原值|Keep current value
填写的项会覆盖所选全部作品的对应信息；其他必填信息不完整的作品会保留待处理，需要逐件打开补齐。|Filled fields overwrite that information for all selected works. Works missing other required information remain pending and must be completed individually.
所选各项共用|Applies to all selected items
请写明存疑原因，作者和访客都会看到|Explain the dispute. The author and visitors will see it.
后端暂不支持批量处理。|Bulk processing is not supported by the server yet.
未处理的仍保持选中，可以单独打开处理。|Unprocessed items remain selected. Open them individually to review.
处理失败|Processing failed
知道了|Got it
最近活跃|Last active
最新注册|Newest accounts
最早注册|Oldest accounts
投稿最多|Most uploads
计票最多|Most counted votes
当前账号|Current account
由服务器配置固定|Fixed by server configuration
固定|Fixed
已绑定邮箱|Email linked
未绑定邮箱|Email not linked
角色|Role
投稿|Uploads
计票|Counted votes
待审额度|Pending limit
不限|Unlimited
暂无活跃记录|No activity yet
刚刚活跃|Active just now
没有匹配的成员|No matching members
正在载入成员…|Loading members…
角色与参与情况；角色调整即时生效并记入审核记录|Roles and participation. Role changes take effect immediately and are recorded in review history.
搜索用户名或昵称|Search usernames or display names
按邮箱筛选|Filter by email
全部邮箱状态|All email states
按活跃时间筛选|Filter by activity
全部活跃时间|All activity periods
7 天内活跃|Active in the last 7 days
30 天内活跃|Active in the last 30 days
超过 30 天未活跃|Inactive for over 30 days
成员排序|Sort members
管理成员|Manage member
当前角色|Current role
服务器固定|Fixed by server
未绑定|Not linked
未绑定邮箱不能投稿或发起题目。|An email is required to upload works or create questions.
注册时间|Registration date
盲评计票|Counted evaluation votes
在全部作品中查看|View in all works
最近的审核记录里没有角色调整。|No role changes in recent review history.
决定能否进入审核页，以及能处理哪些内容。|Controls access to review and which content can be managed.
当前|Current
保存角色|Save role
不能修改自己的角色，需由其他高级管理员调整。|Another senior administrator must change your own role.
该账号由服务器配置 ADMIN_USERNAMES 固定为高级管理员，需先修改服务器配置。|This account is fixed as a senior administrator by ADMIN_USERNAMES. Change the server configuration first.
审核题目与作品，可以审核本人发布的|Review questions and works, including your own
管理全部题目、全部作品，删除作品|Manage all questions and works, and delete works
调整其他成员的角色|Change other members' roles
投稿不限量，单独发起题目不受参与门槛限制|Unlimited uploads and no participation threshold for creating questions
内容审核与核验他人作品，管理展示与盲评|Review and verify others' works, manage visibility and blind review
编辑作品信息；本人作品的审核与展示由其他管理员处理|Edit work information. Other administrators review your own works and manage their visibility.
不能审核或管理题目、删除作品、调整角色|Cannot review or manage questions, delete works or change roles
发起题目、投稿、参加盲评计票|Create questions, upload works and cast counted evaluation votes
待审投稿最多 8 件；已核验满 3 件且近 90 天无存疑的可信成员 20 件|Up to 8 pending uploads, or 20 for trusted members with 3 verified works and no disputes in the last 90 days
单独发起题目需计票满 100 次或已提交作品满 10 件|Creating a standalone question requires 100 counted votes or 10 submitted works
不能进入审核页|No access to review
保存后立即可以进入审核页，审核与核验他人作品、管理展示；投稿不再限量。|Saving grants immediate review access to review and verify others' works and manage visibility. Upload limits are removed.
保存后立即获得全部管理权限，包括题目审核与管理、删除作品和调整其他成员的角色。|Saving immediately grants all administrative permissions, including question review and management, work deletion and role changes.
保存后增加题目审核与管理、删除作品和调整其他成员的角色。|Saving grants question review and management, work deletion and role changes.
保存后立即失去题目审核与管理、删除作品和调整角色；仍可审核与核验他人作品。|Saving immediately removes question management, work deletion and role changes. Reviewing and verifying others' works remains available.
保存后立即不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。|Saving immediately removes review access. Previous decisions and history are retained. Pending uploads use member limits.
保存后立即失去全部管理权限，不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。|Saving immediately removes all administrative permissions and review access. Previous decisions and history are retained. Pending uploads use member limits.
本作品由人工智能模型生成|This work was generated by an AI model
AI 生成|AI generated
使用条款|Terms of use
使用条款与免责声明|Terms of use and disclaimer
隐私政策|Privacy policy
《使用条款》|Terms of use
《隐私政策》|Privacy policy
关于本站|About this site
AI 生成内容|AI-generated content
评测与榜单|Evaluation and rankings
知识产权|Intellectual property
引用、转载与二次创作|Citation, republication and adaptations
使用规范|Acceptable use
免责声明|Disclaimer
侵权与内容投诉|Copyright and content complaints
条款更新|Changes to these terms
联系我们|Contact us
适用范围|Scope
我们收集的信息|Information we collect
我们如何使用信息|How we use information
第三方服务与委托处理|Third-party services and processors
公开展示的信息|Public information
存储与保护|Storage and protection
你的权利|Your rights
未成年人|Minors
政策更新|Policy updates
使用本站、引用评测结果或转载内容之前，请先阅读以下条款。|Read these terms before using the site, citing evaluations or republishing content.
我们收集哪些信息、如何使用与保护，以及你拥有的权利。|What we collect, how we use and protect it, and your rights.
引用格式|Citation format
复制|Copy
引用格式已复制|Citation copied
复制失败，请手动选择文字复制|Copy failed. Select and copy the text manually.
另请参阅：|See also:
最近更新 {value}|Last updated {value}
使用条款目录|Terms of use contents
隐私政策目录|Privacy policy contents
`.trim().split('\n').map((line) => line.split('|')));
// Legal text is translated at text-node boundaries, preserving inline links and emphasis.
const legal = Object.fromEntries(`
「亿模亿样」由ArenaGalleri 运营团队（以下称“我们”）运营，是一个比较 AI 模型前端生成能力的平台：我们把同一份提示词交给不同模型，收录它们生成的可运行作品，并提供在线预览、截图对照、双盲评测与榜单。|ArenaGalleri is operated by the ArenaGalleri team ("we"). It compares AI models' frontend generation abilities by giving them the same prompt, collecting runnable works, and offering live previews, screenshot comparisons, double-blind review and rankings.
访问或使用本站，即表示你已阅读并同意本条款与|By accessing or using this site, you confirm that you have read and agree to these terms and the\u0020
；如不同意，请停止使用。|. If you do not agree, stop using the site.
站内作品由第三方 AI 模型根据提示词生成，投稿作品的生成方式由投稿者声明。作品可能不准确、不完整或含有错误，不代表我们的观点。|Works are generated by third-party AI models from prompts. Submitters declare how their works were generated. Works may be inaccurate, incomplete or contain errors, and do not represent our views.
我们在作品的展示、预览与评测处以「AI 生成」标识提示内容来源。转载、引用站内作品时，请保留 AI 生成的说明，不得删除、篡改或隐匿。|We label works "AI generated" in displays, previews and evaluations. Retain this disclosure when republishing or citing works; do not remove, alter or hide it.
作品在隔离的沙盒中运行，但仍是第三方生成的代码。请勿在作品页面中输入账号密码、支付信息等个人敏感信息。|Works run in isolated sandboxes but contain third-party generated code. Do not enter sensitive information such as passwords or payment details in them.
模型名称、厂商名称及商标归各自权利人所有。除另有说明外，我们与所列模型厂商不存在隶属、合作或背书关系。|Model names, vendor names and trademarks belong to their respective owners. Unless stated otherwise, we have no affiliation, partnership or endorsement relationship with listed vendors.
盲评结果与榜单依据站内用户投票经统计方法计算，只反映特定题目、特定时间与特定样本下的相对偏好。|Blind review results and rankings are calculated statistically from user votes. They reflect relative preferences for specific questions, times and samples only.
评测结果不构成对任何模型、产品或厂商能力的权威评价、担保或采购建议。投票增加与数据更新后，排名可能变化。|Results are not authoritative assessments, guarantees or purchasing advice for any model, product or vendor. Rankings may change as votes and data increase.
我们会识别刷票与异常投票，并有权剔除相应数据。|We identify vote manipulation and anomalous votes and reserve the right to exclude them.
站内题目的提示词由ArenaGalleri 运营团队原创设计。提示词、题目编排、页面设计、截图整理、榜单数据及其汇编的相关权利归我们所有。|The ArenaGalleri team creates the site's question prompts. We hold the relevant rights to prompts, question arrangements, page designs, screenshot collections, ranking data and their compilations.
投稿作品的权利归投稿者或其合法权利人。投稿即表示你确认有权提交该作品，并授予我们在本站范围内免费展示、运行、截图，以及用于评测与榜单统计的非独占许可。|Rights to submitted works belong to submitters or their lawful owners. By submitting, you confirm your right to do so and grant us a free, non-exclusive license to display, run and capture the work on this site and use it for evaluation and ranking statistics.
欢迎在视频、文章、直播、社交媒体、课程与研究中引用本站内容，请遵守以下要求：|You may cite this site's content in videos, articles, livestreams, social media, courses and research, subject to these requirements:
注明来源。|Credit the source.
使用本站的对比结果、截图、录屏、榜单或提示词时，须以清晰可见的方式注明来源「亿模亿样」及本站网址。视频请在画面中或简介里标注，图文请在引用处或文末标注。|Clearly credit "ArenaGalleri" and the site's URL when using comparisons, screenshots, recordings, rankings or prompts. Place credit in the video or description, or beside the citation or at the end of an article.
如实呈现。|Present results accurately.
不得篡改、拼接或断章取义地使用评测结果，不得捏造本站没有的数据，也不得暗示我们为你的内容或产品背书。|Do not alter, splice or misrepresent results, invent data, or imply that we endorse your content or product.
商业用途须事先授权。|Commercial use requires prior permission.
用于广告、营销推广、付费课程或付费内容、商业报告、产品宣传等商业用途，或批量复制题目提示词、榜单数据的，须事先发邮件至|For advertising, marketing, paid courses or content, commercial reports, product promotion or bulk copying of prompts or ranking data, email
取得书面许可。|to obtain written permission in advance.
个人创作的平台收益不算商业用途。|Platform incentives for personal creations are not commercial use.
个人创作者因平台创作激励获得的收益视为非商业引用，注明来源即可；接受品牌赞助或商业推广的内容按商业用途处理。|Platform creator incentives count as non-commercial citation and only require attribution. Brand sponsorships and commercial promotions count as commercial use.
不得批量抓取。|Do not scrape in bulk.
请勿以爬虫等自动化方式大规模获取本站数据。|Do not use crawlers or other automated methods to collect this site's data at scale.
使用本站时，不得以脚本、多账号或其他方式刷票、操纵榜单；不得上传恶意代码、侵权内容或违法违规内容；不得攻击、干扰本站服务或绕过访问限制。违反者，我们可删除相关内容、撤销投票，并限制或终止账号。|Do not manipulate votes or rankings using scripts, multiple accounts or other methods; upload malicious code, infringing or unlawful content; attack or disrupt the service; or bypass access restrictions. We may remove content, revoke votes and restrict or terminate accounts for violations.
本站按「现状」提供服务，不保证服务不中断、没有错误，也不保证内容完整、准确。|The service is provided "as is", without guarantees of uninterrupted or error-free operation or complete and accurate content.
在法律允许的范围内，因使用或无法使用本站、或依据站内内容与评测结果做出决定而造成的损失，我们不承担责任。|To the extent permitted by law, we are not liable for losses arising from using or being unable to use the site, or decisions based on its content or evaluations.
本站可能包含第三方链接或资源，第三方内容由其自行负责。|The site may include third-party links or resources. Third parties are responsible for their content.
如果你认为站内内容侵犯了你的合法权益，或含有违法、不当信息，请发邮件至|If content infringes your rights or contains unlawful or inappropriate information, email
，写明你的身份与联系方式、相关页面链接，以及权属证明或投诉理由。我们收到后会尽快核实处理。|with your identity, contact details, relevant links and evidence of ownership or grounds for the complaint. We will investigate and respond as soon as possible.
我们可能根据运营需要或法律要求更新本条款。更新后的条款发布在本页即生效，页首日期为最近一次更新时间。|We may update these terms for operational or legal reasons. Updates take effect when posted here. The date at the top shows the latest revision.
运营者：ArenaGalleri 运营团队|Operator: ArenaGalleri team
合作、授权、反馈与投诉：|Partnerships, permissions, feedback and complaints:
本政策说明ArenaGalleri 运营团队（以下称“我们”）在「亿模亿样」画廊及共用同一账号体系的竞技场站点中，如何收集、使用、保存和保护你的个人信息。使用本站服务，即表示你同意我们按本政策处理你的个人信息。|This policy explains how the ArenaGalleri team ("we") collects, uses, stores and protects personal information in the gallery and arena sites sharing the same account system. Using our services means you agree to this processing.
账号信息。|Account information.
注册时的用户名、密码与邮箱（密码只以加盐哈希形式保存，我们无法得知明文）；你设置的昵称与头像；你在账号绑定中更换的邮箱。|Your registration username, password and email; your display name and avatar; and any replacement email. Passwords are stored only as salted hashes, and we cannot read them in plain text.
你发布的内容。|Content you publish.
你发起的题目、上传的作品文件与封面、评论、表情回应、盲评投票与猜题结果。|Questions, uploaded work files and covers, comments, reactions, blind review votes and guessing results.
登录状态。|Sign-in state.
登录后浏览器会保存一个只供服务器读取的会话 Cookie，有效期 30 天，退出登录即失效。|After sign-in, your browser stores a session cookie readable only by the server. It lasts 30 days and expires when you sign out.
访问与安全信息。|Access and security information.
为防止刷票、滥用与攻击，服务器会临时处理你的 IP 地址以限制访问频率。访问统计与猜题防重复只保存 IP 经每日更换的随机盐单向哈希后的值，不保存原始 IP。服务器运行日志会记录 IP、时间与请求地址。|The server temporarily processes your IP address to rate-limit access and prevent manipulation, abuse and attacks. Visit statistics and duplicate-guess prevention store only one-way IP hashes using a random salt changed daily, not raw IP addresses. Server logs record IP addresses, times and request URLs.
盲评提交。|Blind review submissions.
提交盲评投票时，为防止刷票，我们会记录你的 IP 地址与浏览器标识（User-Agent）。原始 IP 保留 180 天，之后仅保留网段。|When you submit a blind review vote, we record your IP address and browser identifier (User-Agent) to prevent vote stuffing. Raw IP addresses are kept for 180 days, after which only the network segment is kept.
本地偏好。|Local preferences.
主题、排序方式等界面偏好只保存在你的浏览器中，不会上传。|Preferences such as theme and sorting are stored only in your browser and are not uploaded.
我们不使用广告追踪或第三方统计分析工具。|We do not use advertising trackers or third-party analytics tools.
提供账号登录、题目发布、作品投稿、评论、盲评与榜单等功能。|Provide sign-in, question publishing, work uploads, comments, blind review and rankings.
通过邮箱发送验证码，用于注册、绑定或更换邮箱与找回密码。|Send email codes for registration, linking or changing email, and password recovery.
识别刷票、批量注册、恶意请求等行为，保障服务安全与评测公正。|Detect vote manipulation, bulk registration and malicious requests to protect service security and evaluation fairness.
审核投稿内容，防止违法违规信息传播。|Review submissions to prevent the spread of unlawful content.
人机验证。|Human verification.
注册或登录时可能加载 Cloudflare Turnstile，它会处理浏览器与设备信号，用于判断请求是否来自自动化程序。|Registration or sign-in may load Cloudflare Turnstile, which processes browser and device signals to detect automated requests.
邮件发送。|Email delivery.
验证码邮件通过邮件服务商发送，只提供收件邮箱与邮件内容。|Verification emails are sent through an email provider, which receives only the recipient address and email content.
内容审核。|Content review.
投稿作品的标题、说明、页面文字、封面与页面截图会发送至 AI 内容审核服务，用于识别违法违规内容，请求设置为服务方不留存。审核不涉及你的用户名、密码、邮箱等账号信息。|Submitted work titles, descriptions, page text, covers and screenshots are sent to an AI content review service to detect unlawful content, with requests configured for no retention by the provider. Review does not include account information such as usernames, passwords or emails.
作品引用的公共资源。|Public resources used by works.
部分作品会从公共 CDN（如 jsDelivr、unpkg、cdnjs、Google Fonts）加载脚本或字体，运行这些作品时，你的浏览器会直接连接这些服务。|Some works load scripts or fonts from public CDNs such as jsDelivr, unpkg, cdnjs and Google Fonts. Your browser connects directly to those services when running the works.
除上述情形与法律法规要求外，我们不会向任何第三方出售、出租或提供你的个人信息。|Except as described above or required by law, we do not sell, rent or provide your personal information to third parties.
你的昵称、头像，以及你发起的题目、上传的作品和发表的评论会公开显示。登录用户名与邮箱不会公开。盲评中你的具体选择不会公开，只计入统计结果。|Your display name, avatar, questions, uploaded works and comments are public. Your login username and email are private. Individual blind review choices are not public and contribute only to statistics.
你的个人信息存储在我们运营的服务器上。|Personal information is stored on servers we operate.
我们采取密码哈希、仅限服务器读取的 Cookie、作品运行于独立域名的沙盒、访问频率限制与加密备份等措施保护数据。|We protect data with password hashing, server-only cookies, work sandboxes on a separate domain, rate limits and encrypted backups.
账号信息在账号存续期间保存；账号注销后，我们会删除或匿名化相关个人信息，法律法规要求保留的除外。备份中的数据会在备份轮换周期内被覆盖。|Account information is retained while the account exists. After deletion, we delete or anonymize personal information unless retention is legally required. Backup data is overwritten during the backup rotation cycle.
你可以在个人中心查看与修改昵称、头像，查看你的题目与作品，并删除自己上传的作品与发表的评论。|In your account, you can view and change your display name and avatar, view questions and works, and delete your uploaded works and comments.
如需查阅、复制或更正其他个人信息，注销账号，或撤回你的同意，请发邮件至|To access, copy or correct other personal information, delete your account or withdraw consent, email
。我们会在核实身份后 15 个工作日内处理。|. We will process your request within 15 business days after verifying your identity.
若你未满 14 周岁，请在监护人同意与指导下使用本站。如果监护人发现未成年人在未经同意的情况下提供了个人信息，请联系我们删除。|If you are under 14, use the site with a guardian's consent and guidance. Guardians who find personal information provided without consent can contact us for deletion.
我们可能根据业务调整或法律要求更新本政策。更新后的政策发布在本页即生效，页首日期为最近一次更新时间。|We may update this policy for business or legal reasons. Updates take effect when posted here. The date at the top shows the latest revision.
个人信息保护相关问题请联系ArenaGalleri 运营团队：|For personal information protection questions, contact the ArenaGalleri team:
`.trim().split('\n').map((line) => line.split('|')));

const dynamic = Object.fromEntries(`
第 {value} / {value2} 页 · 共 {value3} 项|Page {value} / {value2} · {value3} items
全选当前页（{value} 件）|Select this page ({value} works)
全选当前页（{value} 道）|Select this page ({value} questions)
{value} 分 {value2} 秒后重发|Resend in {value} minutes {value2} seconds
{value} 秒后重发|Resend in {value} seconds
当前网络发送请求较多。请在 {value} 分 {value2} 秒后重试。|Too many email requests from this network. Try again in {value} minutes {value2} seconds.
当前网络发送请求较多。请在 {value} 秒后重试。|Too many email requests from this network. Try again in {value} seconds.
该邮箱发送次数已达上限。请在 {value} 分 {value2} 秒后重试。|This email has reached the sending limit. Try again in {value} minutes {value2} seconds.
该邮箱发送次数已达上限。请在 {value} 秒后重试。|This email has reached the sending limit. Try again in {value} seconds.
验证码刚刚发送。请在 {value} 分 {value2} 秒后重试。|A code was just sent. Try again in {value} minutes {value2} seconds.
验证码刚刚发送。请在 {value} 秒后重试。|A code was just sent. Try again in {value} seconds.
改为高级管理员|Change to senior administrator
改为普通管理员|Change to administrator
改为成员|Change to member
已将 {value} 改为高级管理员|Changed {value} to senior administrator
已将 {value} 改为普通管理员|Changed {value} to administrator
已将 {value} 改为成员|Changed {value} to member
显示 {value} / {value2} 件作品|Showing {value} / {value2} works
全选（{value} 件）|Select all ({value} works)
全选（{value} 道）|Select all ({value} questions)
已选 {value} 件|Selected {value} works
已选 {value} 道|Selected {value} questions
{value} 件已通过核验|{value} works verified
{value} 件已标记存疑|{value} works marked disputed
{value} 件内容已通过|{value} works content-approved
{value} 件内容已拒绝|{value} works rejected
{value} 道已通过|{value} questions approved
{value} 道已拒绝|{value} questions rejected
{value} 件已通过核验，{value2} 件未处理|{value} works verified; {value2} works unprocessed
{value} 件已标记存疑，{value2} 件未处理|{value} works marked disputed; {value2} works unprocessed
{value} 件内容已通过，{value2} 件未处理|{value} works content-approved; {value2} works unprocessed
{value} 件内容已拒绝，{value2} 件未处理|{value} works rejected; {value2} works unprocessed
{value} 道已通过，{value2} 道未处理|{value} questions approved; {value2} questions unprocessed
{value} 道已拒绝，{value2} 道未处理|{value} questions rejected; {value2} questions unprocessed
最后活跃|Last active
现在：|Current:
作品不会公开。|The work stays private.
可以删除后修改，再重新上传。|You can delete it, revise it and upload again.
核验存疑|Verification disputed
存疑作品不能再修改，可以删除后重新上传。|Disputed works cannot be edited. You can delete and upload again.
登录账号|Username
加入|Joined
注册于|Joined
类别：|Categories:
错误：|Error:
原因：|Reason:
ArenaGalleri 运营团队|ArenaGalleri team
来源：亿模亿样（{value}）|Source: ArenaGalleri ({value})
输入账号，验证码会发到账号绑定的邮箱。没有绑定邮箱的账号，请发邮件至|Enter your username. A code will be sent to its linked email. If no email is linked, email
联系我们。|to contact us.
注册即表示你已阅读并同意|By signing up, you confirm that you have read and agree to\u0020
与|\u0020and\u0020
已被管理员撤下|Hidden by an administrator
（未上展览馆）|(not in the gallery)
· 作者原始声明：|· Author's original declaration:
所属题目未通过审核，作品不会公开。|The question was rejected, so this work stays private.
等待管理员核对生成信息，公开展示以人工审核和展示设置为准。{value}|Awaiting verification of generation details. Publication depends on review and visibility settings. {value}
核验通过前可以修改。{value}|You can edit this before verification. {value}
（未收录{value}，可在数据仓注册表补录）|(unregistered{value}; can be added to the data registry)
，按名称推断为 {value}|, inferred from the name as {value}
· {value} 个 · {value2} · 入口 {value3}|· {value} files · {value2} · Entry {value3}
{value} 个 · {value2} · 入口 {value3}|{value} files · {value2} · Entry {value3}
{value} {value2} 件？|{value} {value2} works?
，{value} 件作品随之删除|, along with {value} works
已公开{value}|Public{value}
{value} works{value2}，{value3} works未处理|{value} works {value2}; {value3} works unprocessed
{value} questions{value2}，{value3} questions未处理|{value} questions {value2}; {value3} questions unprocessed
题目只能人工审核，通过后进入题库并开放投稿。确认提示词是一项具体、可比较的生成任务；拒绝时写明理由，作者会看到。示例结果的内容可以在题目里直接审核。|Questions require manual review before publication and uploads. Check that the prompt describes a specific, comparable generation task. Explain rejections to the author. Sample content can be reviewed within the question.
只判断能否公开。自动审核没能确定的投稿在这里由人决定：通过后转入「核验」，拒绝时写明理由，作者会看到。针对审查模型的提示词注入会被自动拒绝、不进这里；要复查或改判，到「已处理」的「机审拒绝」「疑似注入」。|Decide whether publication is allowed when automatic review is inconclusive. Approval moves to verification; rejection requires a reason visible to the author. Prompt injection targeting the reviewer is rejected automatically. Reconsider those decisions under Processed → Automatically rejected or Suspected injection.
内容已通过、还没核验的投稿，最早的在前。核对能否运行、是否符合题目、生成信息是否可信。通过即公开到展览馆，单轮生成且无人工介入的同时进入盲评；无法核实的标记存疑并写明原因。|Content-approved uploads awaiting verification, oldest first. Check that they run, answer the question and have credible generation details. Verification publishes to the gallery; single-round generation without human intervention also enters blind review. Mark unverifiable works disputed and explain why.
核验过的作品，每行写明现在在哪里显示，按钮就是下一步。存疑与拒绝的原因对作者可见。|Verified works show their current visibility and next actions. Authors can see dispute and rejection reasons.
最近的审核与管理操作。|Recent review and management actions.
站内的全部题目：发布者、公开状态和作品情况。可以编辑、开关投稿、指定封面、撤下或恢复；已有投票的题目不能删除。|All questions with publishers, publication state and works. Edit, open or close uploads, choose covers, hide or restore questions. Questions with votes cannot be deleted.
查找、编辑作品信息，分别管理展览馆与盲评展示。审核决定在作品详情中单独处理；保存信息不会自动通过审核。|Find and edit works and manage gallery and evaluation visibility separately. Review decisions are made in work details; saving information does not approve a work.
站内的全部账号：角色、邮箱和参与情况。可以把成员设为普通或高级管理员，也可以撤销；自己和服务器固定的账号除外。|All accounts with roles, email and participation. Grant or revoke administrator and senior administrator roles, except for your own account and server-fixed accounts.
件|works
道|questions
· 可信成员|· Trusted member
· 服务器固定|· Fixed by server
· 本人作品|· Your own work
· 本人作品可编辑信息，展示设置由其他管理员处理|· You can edit your work's information; another administrator manages its visibility
已计入的盲评票继续保留在榜单中；|Counted evaluation votes remain in the rankings;
1月|Jan
2月|Feb
3月|Mar
4月|Apr
5月|May
6月|Jun
7月|Jul
8月|Aug
9月|Sep
10月|Oct
11月|Nov
12月|Dec
已评 {value} 组|{value} evaluations
{value} 件 · 可信成员|{value} works · Trusted member
{value}（已删除）|{value} (deleted)
{value} 件作品 · {value2}|{value} works · {value2}
这道题已经公开{value}。撤下后作品随之不再公开，相关投票暂不计入排行榜；重新通过后恢复。|This question is already public{value}. Hiding it also hides its works and temporarily excludes its votes from rankings. Approval restores them.
「{value}」会从展厅和盲评中下架。{value2}没有对局记录的作品会同时删除文件。{value3}|"{value}" will be removed from the gallery and blind review. {value2} Files are deleted for works with no match records. {value3}
操作会记入审核记录。|This action is recorded in review history.
「{value}」会被删除，无法恢复。未公开的题目会连同示例结果一起撤回；已经有人作答的题目不能删除。|"{value}" will be permanently deleted. Unpublished questions and their samples are withdrawn together. Questions with submitted answers cannot be deleted.
「{value}」会从题库中移除并写入审核记录{value2}。已有投票的题目不能删除。|"{value}" will be removed and recorded in review history{value2}. Questions with votes cannot be deleted.
「{value}」会公开到题库并开放投稿。|"{value}" will be published and accept uploads.
「{value}」会从题库撤下，作者会看到下面的理由。|"{value}" will be hidden. The author will see the reason below.
「{value}」不会公开，作者会看到下面的理由。|"{value}" will remain private. The author will see the reason below.
{value} 件？|{value} works?
{value} 件已公开到展览馆|{value} works published to gallery
{value} 件已撤下|{value} works hidden
{value} 件已移出盲评|{value} works removed from blind review
{value} works已通过核验|{value} works verified
{value} questions已通过|{value} questions approved
验证码已发送至 {value}。|Code sent to {value}.
{value}没收到请检查垃圾邮件箱。|{value} If it hasn't arrived, check your spam folder.
{value} 秒|{value} seconds
{value} 分 {value2} 秒|{value} minutes {value2} seconds
{value}后重发|Resend in {value}
{value}请在 {value2}后重试。|{value} Try again in {value2}.
账号已创建，欢迎你，{value}|Account created. Welcome, {value}
欢迎回来，{value}|Welcome back, {value}
{value} · 个人中心|{value} · My account
撤回「{value}」|Remove "{value}"
也贴一个「{value}」|Add "{value}" too
{value} · 已评 {value2} 组|{value} · {value2} evaluations
类别：{value}|Categories: {value}
错误：{value}|Error: {value}
原因：{value}|Reason: {value}
作品不会公开。{value}可以删除后修改，再重新上传。|The work stays private. {value} You can delete it, revise it and upload again.
核验存疑{value}。存疑作品不能再修改，可以删除后重新上传。|Verification disputed{value}. Disputed works cannot be edited. You can delete and upload again.
{value}通过核验，{value2}。|{value} Verified, {value2}.
已公开{value} · {value2}|Public{value} · {value2}
已等待 {value} 天。|Waiting for {value} days.
选择「{value}」|Select "{value}"
下架「{value}」|Remove "{value}"
删除「{value}」|Delete "{value}"
第 {value} 次提交|Submission {value}
重新提交 · 第 {value} 次|Resubmission · Attempt {value}
{value} 件作品|{value} works
{value} 件|{value} works
{value} 道|{value} questions
{value} 次|{value} times
{value}月|Month {value}
{value} · {value2} 次活跃|{value} · {value2} activities
{value} 至 {value2}，{value3} 天活跃，共 {value4} 次参与。日期按北京时间统计。|{value} to {value2}, active on {value3} days with {value4} activities. Dates use Beijing time.
{value}的头像|Avatar for {value}
登录账号 {value}|Username {value}
· {value} 加入|· Joined {value}
近一年|Past year
次参与 ·|activities ·
天活跃|active days
作品收到了|Your works received
个回应|reactions
你已有 {value} 件作品在等待核验，已达上限 {value2} 件。核验完成或删除作品后名额会释放，已公开的作品不受影响。|You have {value} works awaiting verification, reaching the limit of {value2}. Verification or deletion frees slots. Published works are unaffected.
每人最多 {value} 件作品同时等待核验，核验完成或删除作品后名额释放。|Each person can have up to {value} works awaiting verification. Verification or deletion frees slots.
已参与 {value} 组盲评|Completed {value} blind reviews
作品暂时未能载入。|Works could not be loaded.
正在载入作品…|Loading works…
题目暂时未能载入。|Questions could not be loaded.
正在载入题目…|Loading questions…
还没有上传作品|No uploads yet
选一道题，上传你让模型生成的答案。|Choose a question and upload your model's answer.
{value} 条：{value2}|{value} errors: {value2}
被拦截：{value}|Blocked: {value}
{value} 个画布|{value} canvases
现在：{value}|Current: {value}
已保存：{value}|Saved: {value}
已撤下：{value}|Hidden: {value}
已通过核验：{value}|Verified: {value}
已标记存疑：{value}|Marked disputed: {value}
人工 · {value}|Manual · {value}
自动 · {value}|Automatic · {value}
{value} 拒绝|Rejected {value}
盲评池 {value} 件 · {value2} 个配置|Evaluation pool: {value} works · {value2} configurations
已有 {value} 件作品，不能再改|{value} works exist; changes are locked
显示 {value} / {value2} 件作品{value3}|Showing {value} / {value2} works{value3}
显示 {value} / {value2} 道题目|Showing {value} / {value2} questions
显示 {value} / {value2} 位成员 · 自己和服务器固定的账号不能在这里改角色|Showing {value} / {value2} members · Your own role and server-fixed accounts cannot be changed here
没有{value}的作品|No works matching {value}
自动审核中 · {value}|Automatic review · {value}
已选 {value} {value2}|Selected {value} {value2}
全选（{value} {value2}）|Select all ({value} {value2})
· 每批最多 200 件，请缩小选择范围|· Up to 200 works per batch; narrow your selection
· 内容队列已清空|· Content queue cleared
· 核验队列已清空|· Verification queue cleared
{value} 件缺推理档位|{value} works have no reasoning level
{value} 件缺服务商|{value} works have no provider
其中 {value}，可以在下面统一补上，否则会失败。|{value}. Fill these fields below for all selected works to avoid failure.
其中 {value} 道还没有题目类型或领域，会失败，需要先编辑或单独通过。|{value} questions have no type or domain and will fail. Edit or approve them individually first.
{value} 小时前活跃|Active {value} hours ago
{value} 天前活跃|Active {value} days ago
{value} 最后活跃|Last active {value}
已核验 {value}|Verified {value}
存疑 {value}|Disputed {value}
待审 {value}|Pending {value}
拒绝 {value}|Rejected {value}
注册于 {value} · {value2} · {value3}|Joined {value} · {value2} · {value3}
已核验 {value} · 存疑 {value2} · 待审 {value3} · 拒绝 {value4}|Verified {value} · Disputed {value2} · Pending {value3} · Rejected {value4}
可信成员需已核验满 3 件且近 90 天无存疑（现在已核验 {value} 件）。|Trusted members need 3 verified works and no disputes in the last 90 days ({value} verified now).
角色记录 · {value}|Role history · {value}
改为{value}|Change to {value}
已将 {value} 改为{value2}|Changed {value} to {value2}
`.trim().split('\n').map((line) => line.split('|')));

const errors = Object.fromEntries(`
当前网络发送请求较多。|Too many email requests from this network.
该邮箱发送次数已达上限。|This email has reached the sending limit.
验证码刚刚发送。|A code was just sent.
请填写题目标题|Enter a question title
请填写测试简述|Enter a test summary
请填写完整提示词|Enter the full prompt
题目标题最多 {value} 字|Question titles can contain up to {value} characters
测试简述最多 {value} 字|Test summaries can contain up to {value} characters
完整提示词最多 {value} 字|Prompts can contain up to {value} characters
标签格式不正确|Invalid tag format
标签为 1–24 字，不能包含特殊符号|Tags must contain 1–24 characters with no special symbols
每道题最多添加 6 个标签|Each question can have up to 6 tags
参考图署名格式不正确|Invalid reference image credit format
参考图署名最多 80 字|Reference image credits can contain up to 80 characters
参考图格式不正确|Invalid reference image format
参考图上传不可用|Reference image uploads are unavailable
请提供要修改的题目信息|Provide the question information to change
数据包题目不能修改参考图，请在数据仓库维护|Packaged reference images must be updated in the data repository
数据包题目不能修改参考图署名，请在数据仓库维护|Packaged reference image credits must be updated in the data repository
提交格式与题目分类不匹配|Submission format does not match the question category
已有作品的题目不能修改提示词|Prompts cannot be changed after works have been submitted
已有作品的题目不能修改参考图或署名|Reference images and credits cannot be changed after works have been submitted
已有作品的题目不能修改提交格式|Submission formats cannot be changed after works have been submitted
投稿开关无效|Invalid upload setting
封面必须是本题现有作品|The cover must be an existing work for this question
你已有 3 道题目在等待审核|You already have 3 questions awaiting review
题目审核结果无效|Invalid question review decision
只有未通过审核的题目可以修改后重新提交|Only rejected questions can be revised and resubmitted
公开过的题目不能修改后重新提交|Previously published questions cannot be revised and resubmitted
示例结果选项无效|Invalid sample work option
题目信息格式不正确|Invalid question information format
内容和上次相同，请按审核意见修改后再提交|Nothing has changed. Revise based on the feedback before resubmitting
只能删除自己发起的题目|You can only delete your own questions
这道题目已有投票记录，不能删除|Questions with votes cannot be deleted
已经有人作答的题目不能删除|Questions with submitted answers cannot be deleted
数据包作品没有托管的上传文件，不能重新自动审核|Packaged works have no hosted upload files for automatic review
自动内容审查未启用|Automatic content review is disabled
请先完成内容审核|Complete content review first
娱乐作品标记无效|Invalid entertainment work setting
只有通过核验才能送进收件箱|Verification is required before sending to the inbox
展示站点无效|Invalid display site
请选择审核通过后展示的网站|Select the site to display the approved work
隐藏作品须先审核通过才能发布|Hidden works require approval before publication
娱乐盲测标记无效|Invalid entertainment evaluation setting
收件箱里没有这件作品|Work not found in the inbox
只有管理员可以作废对局|Only administrators can void matches
只有高级管理员可以清除作品文件|Only senior administrators can purge work files
作废对局时请写明原因|Enter a reason for voiding matches
只能删除自己上传的作品|You can only delete your own uploads
存疑作品仅供参考，不能再互动|Disputed works are for reference only and cannot receive interactions
不支持这个表情|Reaction not supported
请填写{value}|Enter {value}
{value}最多 {value2} 字|{value} can contain up to {value2} characters
请先登录|Sign in first
请先绑定邮箱|Link an email first
仅高级管理员可以操作|Only senior administrators can do this
仅管理员可以操作|Only administrators can do this
审核结果无效|Invalid review decision
审核理由格式不正确|Invalid review reason format
审核理由最多 500 字|Review reasons can contain up to 500 characters
请填写拒绝理由|Enter a rejection reason
请选择 1–{value} 道题目|Select 1–{value} questions
请选择 1–{value} 件作品|Select 1–{value} works
服务器出错了，请稍后再试|Server error. Try again shortly
人机验证未通过，请重试。|Human verification failed. Try again.
人机验证服务暂时不可用，请稍后重试。|Human verification is temporarily unavailable. Try again shortly.
单独提交题目需要完成 100 次有效盲评或上传 10 件作品；附带示例结果可直接发起。|A standalone question requires 100 valid evaluations or 10 uploaded works. You can create one directly with a sample work.
请附上一份模型结果|Attach a model-generated sample
题目不存在|Question not found
批量核验信息无效|Invalid bulk verification information
门面开关无效|Invalid visibility settings
作品不存在|Work not found
题型筛选无效|Invalid question type filter
领域筛选无效|Invalid domain filter
Harness筛选无效|Invalid Harness filter
服务商筛选无效|Invalid provider filter
文件不存在|File not found
接口不存在|Endpoint not found
不支持这个操作|Operation not supported
请求头无效|Invalid request headers
此接口返回完整目录，不支持分页参数|This endpoint returns the full catalog and does not support pagination
门面参数无效|Invalid display target
状态筛选无效|Invalid status filter
开关筛选无效|Invalid visibility filter
请指定筛选门面|Select a display target
发布者筛选无效|Invalid publisher filter
模型筛选无效|Invalid model filter
档位筛选无效|Invalid reasoning level filter
生成信息筛选无效|Invalid generation information filter
点评或策展文案无效|Invalid commentary or curatorial text
展览馆不使用六维权重|The gallery does not use six-dimension weights
六维权重须为 6 个 0–1 数字，且总和为 1|Weights must be six numbers from 0 to 1 and total 1
仅高级管理员可以固定模型|Only senior administrators can pin models
这道题由 AI 评分，暂不开放盲评|This question uses AI scoring and does not support blind review yet
这道题还没有两个不同模型配置的已验证作品|This question needs verified works from two different model configurations
这道题没有该模型可配对的作品|No works can be paired with this model for this question
这道题剩下的组合都有刚揭晓过的作品|All remaining pairs include recently revealed works
这道题的组合你都已经评过了，换一道题试试|You have evaluated every pair for this question. Try another question
这一组已经失效，请开始新的一组|This pair has expired. Start a new pair
这一组已经提交过了|This pair was already submitted
这道题由 AI 评分，暂不接受投票|This question uses AI scoring and does not accept votes yet
选择无效|Invalid choice
更正侧与原因必填|Select a side and enter a correction reason
仅可更正模型、厂商、档位、Harness 和服务商|Only model, vendor, reasoning level, Harness and provider can be corrected
投票不存在|Vote not found
旧票没有完整的当时身份快照，不能推断更正|This vote has no complete identity snapshot and cannot be corrected by inference
验证码不正确或已过期，请重新获取。|The code is incorrect or expired. Request a new one.
请填写邮箱和验证码。|Enter your email and code.
请填写正确的邮箱地址。|Enter a valid email address.
请求类型无效。|Invalid request type.
请先登录后再绑定邮箱。|Sign in before linking an email.
该邮箱已被其他账号绑定，请换一个。|This email is linked to another account. Use a different address.
邮件服务未配置，暂时无法发送验证码。|Email delivery is not configured. Codes cannot be sent right now.
验证码邮件发送失败，请稍后重试。|The code email could not be sent. Try again shortly.
用户名为 2–24 位文字、数字、下划线或连字符|Usernames must contain 2–24 letters, digits, underscores or hyphens
密码需要 8–128 位|Passwords must contain 8–128 characters
请从头像库中选择头像|Choose an avatar from the library
请填写昵称|Enter a display name
昵称为 1–24 个字，不能包含换行或控制字符|Display names must contain 1–24 characters with no line breaks or control characters
这个用户名已被使用|This username is already taken
用户名或密码不正确|Incorrect username or password
角色无效|Invalid role
该账号由 ADMIN_USERNAMES 固定为管理员，请先修改服务器配置|This account is fixed as an administrator by ADMIN_USERNAMES. Change the server configuration first
用户不存在|User not found
不能修改自己的角色，避免把自己锁在管理端之外|You cannot change your own role to avoid losing administrative access
请选择题目分类|Select a question category
所属领域为 1–{value} 个，且须在列表内|Select 1–{value} domains from the list
请输入 1–280 字的评论|Enter a comment of 1–280 characters
评论不存在|Comment not found
只能删除自己的评论|You can only delete your own comments
内容超过 {value} 上限|Content exceeds the {value} limit
请求格式无效|Invalid request format
请求内容必须是对象|Request body must be an object
请求内容无法解析|Request body could not be parsed
请求来源无效|Invalid request origin
路径参数编码无效|Invalid path parameter encoding
操作太频繁，请稍后再试|Too many requests. Try again shortly
生成信息须为文本|Generation information must be text
生成方式无效|Invalid generation method
人工介入程度无效|Invalid human intervention level
文件名无效|Invalid filename
只支持 .html / .htm / .zip 文件|Only .html, .htm and .zip files are supported
收件箱里已有同名文件，可以在表单里选择覆盖|A file with this name is already in the inbox. Choose overwrite in the form
压缩包里包含系统无法存储的文件名|The archive contains filenames the system cannot store
收件箱里没有这个文件，请重新上传|This file is not in the inbox. Upload it again
收件箱里没有这个文件|File not found in the inbox
压缩包含有不安全或无法保存的路径：{value}|The archive contains an unsafe or unsupported path: {value}
文件不是有效的 ZIP 压缩包|The file is not a valid ZIP archive
不支持分卷 ZIP|Split ZIP archives are not supported
不支持 ZIP64 格式，请减少文件数量后重新打包|ZIP64 is not supported. Reduce the file count and repack
ZIP 目录已损坏|The ZIP directory is corrupted
请移除 {value}：压缩包不能包含密钥文件|Remove {value}: archives must not include secret key files
不支持符号链接：{value}|Symbolic links are not supported: {value}
不支持加密的 ZIP|Encrypted ZIP archives are not supported
不支持的压缩方式：{value}（请使用标准 ZIP）|Unsupported compression: {value} (use standard ZIP)
不支持 ZIP64 格式|ZIP64 is not supported
压缩包内有重复的文件：{value}|Duplicate archive file: {value}
文件数量超过 {value} 个上限|File count exceeds the limit of {value}
单个文件超过 {value}：{value2}|File exceeds {value}: {value2}
解压后超过 {value} 上限|Unpacked size exceeds the {value} limit
压缩比例异常：{value}|Abnormal compression ratio: {value}
ZIP 数据已损坏|The ZIP data is corrupted
无法解压：{value}|Cannot unpack: {value}
文件校验失败：{value}|File verification failed: {value}
压缩包里没有文件|The archive contains no files
压缩包内有同名的文件和文件夹：{value}|A file and directory share the same archive path: {value}
这看起来是未构建的项目源码。请先运行构建（如 npm run build），把生成的 dist/ 一起打包后再上传。|This appears to be unbuilt source code. Build it first (for example, npm run build), then include the generated dist/ folder in your upload.
找不到入口页面：压缩包根目录（或 dist/）需要有 index.html|Entry page not found: include index.html at the archive root or in dist/
文件是空的|The file is empty
请上传 ZIP 压缩包或单个 HTML 文件|Upload a ZIP archive or a single HTML file
{value} 不是可以识别的网页入口|{value} is not a recognizable web entry page
入口页面引用的脚本或样式不存在：{value}|The entry page references missing scripts or styles: {value}
文件路径不合法|Invalid file path
封面图片格式无效|Invalid cover image format
封面图片不能超过 3 MB|Cover images must be no larger than 3 MB
封面只支持 PNG、JPEG 或 WebP|Covers must be PNG, JPEG or WebP
所选模型不存在|Selected model not found
请填写模型名称|Enter a model name
{value}不能超过 40 字|{value} must contain no more than 40 characters
所选{value}不存在|Selected {value} not found
{value}不能同时填写登记项和其他|Choose a registered {value} or enter another one, not both
所选服务商不存在|Selected provider not found
提示词版本无效|Invalid prompt version
请选择生成时使用的提示词版本|Select the prompt version used for generation
需要管理员权限|Administrator permissions required
需由其他管理员处理自己发布的作品|Another administrator must handle your own work
作品列表无效（每次最多 200 件）|Invalid work list (up to 200 per batch)
校准数据无效|Invalid calibration data
只能校准自己的作品|You can only calibrate your own works
这道题暂不接受上传|This question is not accepting uploads
该题不支持此提交格式|This question does not support this submission format
Vite 项目请包含 package.json 和构建后的 dist/ 目录|Vite projects must include package.json and the built dist/ directory
试加载已结束|Test load has ended
试加载已过期，请重新选择文件|Test load expired. Choose the file again
新题目草稿只能用于发起题目|New question drafts can only be used to create questions
请先确认作品在试加载中运行正常|Confirm the work runs correctly in the test load first
请选择或填写推理档位|Select or enter a reasoning level
请选择服务商|Select a provider
请选择或填写 Harness|Select or enter a Harness
请填写作品标题|Enter a work title
你已有 {value} 件作品在等待核验（上限 {value2} 件），核验完成或删除作品后名额会释放|You have {value} works awaiting verification (limit {value2}). Verification or deletion frees slots
只能修改自己上传的作品|You can only edit your own uploads
作品已核验，信息不能再修改；如有错误请删除后重新上传|Verified works cannot be edited. Delete and upload again to correct errors
没有可修改的内容|Nothing to edit
只有管理员可以调整归属题目|Only administrators can move works to another question
数据包作品不能调整归属题目|Packaged works cannot be moved to another question
目标题目不存在|Target question not found
数据包作品已完成内容审核，请使用作品核验|Packaged works have passed content review. Use work verification
内容审查结果无效|Invalid content review decision
请填写人工审查理由|Enter a manual review reason
`.trim().split('\n').map((line) => line.split('|')));

// Website changelog: page chrome only. Entry titles and bodies come from the server in both languages.
const changelog = Object.fromEntries(`
更新日志|Changelog
亿模亿样的新功能、改进、修复与规则调整。|New features, improvements, fixes and policy changes on ArenaGalleri.
按发布时间倒序|Newest first
全部更新|All updates
更新条数|Updates
最近更新|Latest
更新类型|Update type
更新日志暂时无法加载|The changelog could not be loaded
还没有更新记录|No updates yet
这个类型还没有更新|No updates of this type yet
查看全部|View all
仅中文|Chinese only
去看看|Take a look
复制这条更新的链接|Copy link to this update
已复制链接|Link copied
复制失败，请从地址栏复制|Could not copy. Copy the link from the address bar.
这条更新不存在或已撤下|This update does not exist or has been withdrawn.
`.trim().split('\n').map((line) => line.split('|')));

export default { ...phrases, ...legal, ...dynamic, ...errors, ...changelog };
