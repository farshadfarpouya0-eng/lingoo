import type { Lang } from "./i18n";

type Item = { title: string; text: string };
type Goal = { tag: string; title: string; text: string };
type Character = { name: string; activity: string; text: string; image: string; alt: string };
type Detail = { kicker: string; title: string; text: string; bullets: string[]; stat: string; statLabel: string; image: string; alt: string };
type Promise2 = { value: string; title: string; text: string };

const detailImages = {
  tutor: "/images/feature-tutor.webp",
  study: "/images/feature-study.webp",
  schedule: "/images/feature-schedule.webp",
};
type Home = {
  badge: string; h1a: string; h1b: string; sub: string; heroProof: string;
  searchGoal: string; searchBtn: string; searchPlaceholder: string; popular: string;
  stats: [string, string][]; trust: string;
  goalsTitle: string; goalsSub: string; goals: Goal[];
  detailTitle: string; detailSub: string; details: Detail[];
  kidsTitle: string; kidsSub: string; kidsCta: string; characters: Character[];
  tutorsTitle: string; tutorsSub: string;
  howTitle: string; howSub: string; steps: Item[];
  promiseTitle: string; promiseSub: string; promises: Promise2[];
  whyTitle: string; whySub: string; why: Item[];
  cmpTitle: string; cmpRows: [string, string, string][]; cmpUs: string; cmpThem: string;
  revTitle: string; reviews: { name: string; from: string; text: string; goal: string }[];
  faqTitle: string; faq: [string, string][];
  ctaTutorTitle: string; ctaTutorText: string; ctaTutorPoints: string[]; ctaTutorBtn: string;
  finalTitle: string; finalBtn: string;
};

const characterFiles = {
  birdie: "/images/kids-birdie.webp",
  teddy: "/images/kids-teddy.webp",
  lulu: "/images/kids-lulu.webp",
  nini: "/images/kids-nini.webp",
  momo: "/images/kids-momo.webp",
  piki: "/images/kids-piki.webp",
};

const zh: Home = {
  badge: "专为中国与日本学习者打造 · 一对一英语课程",
  h1a: "找到真正适合你的", h1b: "英语老师",
  sub: "与全球认证英语外教一对一学习。无论是雅思备考、职场沟通，还是孩子的第一堂英语课，都能找到合适的老师。",
  heroProof: "深受中国与日本学习者信赖",
  searchGoal: "选择学习目标", searchBtn: "搜索老师", searchPlaceholder: "输入老师姓名或关键词",
  popular: "热门目标",
  stats: [["2,000+", "认证英语老师"], ["1.2M+", "已完成课程"], ["4.9 / 5", "平均课程评分"], ["30+", "老师所在国家与地区"]],
  trust: "IELTS · TOEFL · TOEIC · 商务英语 · 少儿英语 · 日常口语",
  goalsTitle: "为你的目标找到合适的课程", goalsSub: "专注真实学习目标，筛选最适合你的老师与课程。",
  goals: [
    { tag: "Conversation", title: "日常英语会话", text: "更自然地开口交流" },
    { tag: "IELTS", title: "IELTS 雅思", text: "针对考试的系统备考" },
    { tag: "TOEFL", title: "TOEFL 托福", text: "留学申请与学术英语" },
    { tag: "TOEIC", title: "TOEIC 托业", text: "提升职场英语成绩" },
    { tag: "Business", title: "商务英语", text: "会议、邮件与谈判" },
    { tag: "Kids", title: "儿童英语", text: "寓教于乐，建立自信" },
    { tag: "Pronunciation", title: "发音训练", text: "清晰自然地表达" },
    { tag: "Interview", title: "英语面试", text: "模拟练习与专业反馈" },
  ],
  detailTitle: "一堂真正属于你的英语课", detailSub: "从约课到上课，再到课后复习，每一步都为你的目标而设计。",
  details: [
    { kicker: "量身定制", title: "课程围绕你的目标展开", text: "预约前先和老师沟通，告诉对方你的水平和目标。老师会据此准备专属教材，而不是千篇一律的课程。", bullets: ["上课前可先发消息沟通需求", "针对雅思、商务、口语等目标备课", "课后可获得老师的笔记与建议"], stat: "100%", statLabel: "一对一专属课程", image: detailImages.tutor, alt: "老师正在进行一对一在线英语课" },
    { kicker: "灵活自由", title: "按你的节奏和时区安排", text: "查看老师的真实可约时间，所有时段自动换算成你的时区。无需购买固定课时包，想学几节就约几节。", bullets: ["时间自动换算为北京或东京时间", "最快可约两小时后的课程", "单节预约，不绑定长期套餐"], stat: "24/7", statLabel: "随时可约的时段", image: detailImages.schedule, alt: "在日历上安排英语课程时间" },
    { kicker: "学有所得", title: "持续看得见的进步", text: "在学习中心回顾每一节课、老师的笔记和消息记录，清楚掌握自己的学习轨迹。完成课程后还能给老师评价。", bullets: ["在学习中心集中管理所有课程", "随时查看历史课程与老师笔记", "完成课程后可评分与评价"], stat: "4.9/5", statLabel: "平均课程评分", image: detailImages.study, alt: "学生在家中记录英语学习笔记" },
  ],
  kidsTitle: "让英语学习成为孩子期待的时光", kidsSub: "认识 Lingorain 学习伙伴：阅读、开口表达、书写、听力、词汇游戏和拼词，每一种练习都让孩子在真实参与中学习。", kidsCta: "为孩子寻找英语老师",
  characters: [
    { name: "Birdie", activity: "阅读绘本", text: "一起读故事，在图画与新单词中开启英语启蒙。", image: characterFiles.birdie, alt: "Birdie 正在阅读绘本并认识英语字母" },
    { name: "Teddy", activity: "练习表达", text: "用英语说出想法，练习发音与日常对话。", image: characterFiles.teddy, alt: "Teddy 正在练习英语口语表达" },
    { name: "Lulu", activity: "书写字母", text: "从字母、拼写到简单句子，一步步建立书写能力。", image: characterFiles.lulu, alt: "Lulu 正在练习书写英语字母" },
    { name: "Nini", activity: "专注听力", text: "戴上耳机听英语，熟悉真实发音与语调。", image: characterFiles.nini, alt: "Nini 正在使用耳机练习英语听力" },
    { name: "Momo", activity: "配对词汇", text: "把图片与单词配起来，让新词汇更容易记住。", image: characterFiles.momo, alt: "Momo 正在玩英语图片与词汇配对游戏" },
    { name: "Piki", activity: "拼词挑战", text: "动手拼出英语单词，在挑战中巩固词汇。", image: characterFiles.piki, alt: "Piki 正在用字母拼块练习英语单词" },
  ],
  tutorsTitle: "备受欢迎的英语老师", tutorsSub: "查看老师的真实资料、课程主题与学生评价。",
  howTitle: "三步开始英语学习", howSub: "从挑选老师到进入教室，每一步都简单清晰。",
  steps: [
    { title: "选择老师", text: "按目标、价格、口音和语言浏览老师资料与评价。" },
    { title: "预约时间", text: "选择合适的课程时段，时间自动换算成你的时区。" },
    { title: "在线上课", text: "直接通过浏览器进入一对一视频教室。" },
  ],
  promiseTitle: "安心学习，每一步都有保障", promiseSub: "我们希望你把精力放在学习上，其余的交给清晰的规则。",
  promises: [
    { value: "半价", title: "体验课优惠", text: "符合条件的老师提供半价体验课，先试课再决定。" },
    { value: "托管", title: "资金安全", text: "课程款项由平台托管，课程结束后才支付给老师。" },
    { value: "12h", title: "免费取消", text: "上课前12小时以上可免费取消，退款自动返回钱包。" },
    { value: "审核", title: "真实老师", text: "老师资料经过审核，评价仅来自真实上过课的学生。" },
  ],
  whyTitle: "为什么选择 Lingorain", whySub: "更灵活的课程选择、更清晰的价格与安心的预约流程。",
  why: [
    { title: "适合你的老师", text: "按学习目标、价格、口音及中文或日语能力筛选老师。" },
    { title: "贴合日程安排", text: "查看老师可预约时间，按自己的时区选择课程。" },
    { title: "单节预约", text: "无需购买固定课时包，按实际预约的课程支付。" },
    { title: "先体验再决定", text: "符合条件时，可预约老师的半价体验课。" },
    { title: "明确的取消规则", text: "预订前查看课程与取消规则，避免意外费用。" },
    { title: "真实课程评价", text: "完成课程后，学生可评价实际学习体验。" },
  ],
  cmpTitle: "在线一对一英语学习", cmpUs: "Lingorain", cmpThem: "传统线下课程",
  cmpRows: [["课程价格", "从老师资料中查看", "依机构而异"], ["课程时间", "在线查看可预约时段", "通常固定排课"], ["上课地点", "通过浏览器在线上课", "需要前往教室"], ["老师选择", "浏览老师资料后自行选择", "依机构安排"], ["课程安排", "按需预约单节课程", "可能需要购买课时包"]],
  revTitle: "来自学习者的反馈", reviews: [
    { name: "小林", from: "上海", text: "老师会根据我的目标准备课程。能按工作时间预约，让练习口语更容易坚持。", goal: "日常口语" },
    { name: "Sato Yuki", from: "东京", text: "仕事のあとにレッスンを予約でき、自分のペースでビジネス英語を練習できています。", goal: "商务英语" },
    { name: "陈女士", from: "北京", text: "孩子喜欢课堂里的阅读和互动练习。每节课内容清楚，也会根据孩子的水平调整。", goal: "儿童英语" },
  ],
  faqTitle: "常见问题", faq: [
    ["体验课程如何收费？", "符合条件的老师资料会显示体验课价格。预约前会明确展示课程价格。"],
    ["如果老师没有出现怎么办？", "请通过支持渠道提交课程信息，由平台根据预约记录与课程规则协助处理。"],
    ["可以取消课程吗？", "可以。请在预约页面与课程详情中查看适用的取消时间和退款规则。"],
    ["需要安装软件吗？", "课程教室可通过浏览器打开；请允许浏览器使用摄像头和麦克风。"],
    ["如何成为老师？", "注册老师账号、完善个人资料并设置可授课时间后，即可展示课程资料。"],
  ],
  ctaTutorTitle: "加入 Lingorain 成为英语老师", ctaTutorText: "通过个人资料展示教学经验、课程价格与可授课时间。",
  ctaTutorPoints: ["设置自己的课程价格", "管理可预约时段", "在老师后台查看课程与收入记录"], ctaTutorBtn: "注册老师账号",
  finalTitle: "准备好开始你的下一堂英语课了吗？", finalBtn: "浏览英语老师",
};

const ja: Home = {
  badge: "中国語・日本語話者のためのマンツーマン英語レッスン",
  h1a: "あなたに合う英語講師を", h1b: "見つけよう",
  sub: "認定講師とのマンツーマンレッスン。IELTS対策、仕事の英語、お子さまの初めての英語まで、目的に合った講師を探せます。",
  heroProof: "中国・日本の学習者に信頼されています",
  searchGoal: "学習目標を選ぶ", searchBtn: "講師を探す", searchPlaceholder: "講師名・キーワードを入力",
  popular: "人気の目標",
  stats: [["2,000+", "認定英語講師"], ["1.2M+", "レッスン実績"], ["4.9 / 5", "平均レッスン評価"], ["30+", "講師の国・地域"]],
  trust: "IELTS · TOEFL · TOEIC · ビジネス英語 · キッズ英語 · 日常英会話",
  goalsTitle: "学習目標に合ったレッスンを見つけよう", goalsSub: "目標に合わせて講師を検索。あなたにぴったりのレッスンを。",
  goals: [
    { tag: "Conversation", title: "日常英会話", text: "自然な会話力を身につける" },
    { tag: "IELTS", title: "IELTS対策", text: "試験に合わせた学習プラン" },
    { tag: "TOEFL", title: "TOEFL対策", text: "留学準備とアカデミック英語" },
    { tag: "TOEIC", title: "TOEIC対策", text: "仕事に役立つスコアアップ" },
    { tag: "Business", title: "ビジネス英語", text: "会議・メール・交渉" },
    { tag: "Kids", title: "キッズ英語", text: "楽しく学んで自信をつける" },
    { tag: "Pronunciation", title: "発音レッスン", text: "明瞭で自然な英語を話す" },
    { tag: "Interview", title: "英語面接", text: "模擬面接と具体的なフィードバック" },
  ],
  detailTitle: "あなたのための英語レッスン", detailSub: "予約から受講、復習まで、すべてがあなたの目標のために設計されています。",
  details: [
    { kicker: "オーダーメイド", title: "目標に合わせたレッスン", text: "予約前に講師へメッセージを送り、レベルや目標を伝えられます。講師はそれに合わせて教材を準備。画一的なレッスンではありません。", bullets: ["予約前にメッセージで相談できる", "IELTS・ビジネス・英会話など目標別に準備", "レッスン後に講師のメモを受け取れる"], stat: "100%", statLabel: "マンツーマン専用レッスン", image: detailImages.tutor, alt: "オンラインでマンツーマン英語レッスンを行う講師" },
    { kicker: "自由な予約", title: "あなたのペースとタイムゾーンで", text: "講師の実際の空き時間を確認でき、表示は自動であなたのタイムゾーンに。回数券は不要で、必要なだけ予約できます。", bullets: ["時間は東京・北京時間へ自動変換", "最短2時間後のレッスンも予約可能", "1回ずつ予約、長期契約なし"], stat: "24/7", statLabel: "いつでも予約できる枠", image: detailImages.schedule, alt: "カレンダーで英語レッスンの予定を立てる" },
    { kicker: "確かな手応え", title: "進歩が見える学習", text: "マイページで各レッスン、講師のメモ、メッセージ履歴を振り返り、自分の学習の歩みを把握。受講後は講師を評価できます。", bullets: ["マイページでレッスンを一元管理", "過去のレッスンとメモをいつでも確認", "受講後に評価とレビューを投稿"], stat: "4.9/5", statLabel: "平均レッスン評価", image: detailImages.study, alt: "自宅で英語学習のノートを取る生徒" },
  ],
  kidsTitle: "子どもが楽しみにする英語の時間", kidsSub: "Lingorainの学習パートナーと一緒に、本を読む・声に出す・書く・聞く・単語を合わせる・文字を組み立てる。遊びながら英語に触れられます。", kidsCta: "キッズ英語の講師を探す",
  characters: [
    { name: "Birdie", activity: "絵本を読む", text: "お話を読みながら、新しい単語やアルファベットに出会います。", image: characterFiles.birdie, alt: "絵本と英語の文字を読むBirdie" },
    { name: "Teddy", activity: "英語で話す", text: "声に出して、発音や日常の会話を練習します。", image: characterFiles.teddy, alt: "英語を話す練習をするTeddy" },
    { name: "Lulu", activity: "文字を書く", text: "アルファベットから単語や短い文へ、少しずつ練習。", image: characterFiles.lulu, alt: "英語の文字を書く練習をするLulu" },
    { name: "Nini", activity: "英語を聞く", text: "ヘッドホンで英語を聞き、発音やリズムに慣れます。", image: characterFiles.nini, alt: "ヘッドホンで英語を聞くNini" },
    { name: "Momo", activity: "単語を合わせる", text: "絵と英単語をマッチさせて、楽しく語彙を覚えます。", image: characterFiles.momo, alt: "絵と言葉を組み合わせるMomo" },
    { name: "Piki", activity: "単語パズル", text: "文字ブロックで英単語を作って、語彙を定着させます。", image: characterFiles.piki, alt: "文字ブロックで単語を作るPiki" },
  ],
  tutorsTitle: "人気の英語講師", tutorsSub: "プロフィール、レッスン内容、受講者レビューを確認できます。",
  howTitle: "3ステップで英語レッスンを開始", howSub: "講師選びからオンライン教室まで、簡単に予約できます。",
  steps: [
    { title: "講師を選ぶ", text: "目標・料金・アクセント・対応言語で講師を検索。" },
    { title: "時間を予約", text: "空き時間から選択。表示はあなたのタイムゾーンに合わせます。" },
    { title: "オンラインで受講", text: "ブラウザからマンツーマンのビデオ教室に参加。" },
  ],
  promiseTitle: "安心して学べる仕組み", promiseSub: "学習に集中できるよう、わかりやすいルールを用意しています。",
  promises: [
    { value: "半額", title: "体験レッスン", text: "対象講師は半額の体験レッスンを提供。試してから決められます。" },
    { value: "預かり", title: "安全なお支払い", text: "料金は事務局が預かり、レッスン後に講師へ支払われます。" },
    { value: "12h", title: "無料キャンセル", text: "12時間前までのキャンセルは無料。返金はウォレットへ自動で。" },
    { value: "審査", title: "信頼できる講師", text: "講師は審査済み。レビューは実際に受講した生徒のみ投稿できます。" },
  ],
  whyTitle: "Lingorainが選ばれる理由", whySub: "柔軟な講師選び、わかりやすい料金、安心の予約体験。",
  why: [
    { title: "自分に合った講師", text: "目標・料金・アクセント・日本語や中国語の対応で検索。" },
    { title: "予定に合わせて予約", text: "講師の空き時間を確認し、現地時間でレッスンを予約。" },
    { title: "1回ずつ予約", text: "固定の回数券を購入せず、予約したレッスンごとに支払い。" },
    { title: "まずは体験レッスン", text: "対象講師は体験レッスンの料金をプロフィールに表示。" },
    { title: "明確なキャンセル規定", text: "予約前にレッスンとキャンセルの条件を確認できます。" },
    { title: "受講後のレビュー", text: "レッスンを完了した生徒が実際の体験をレビュー。" },
  ],
  cmpTitle: "オンラインマンツーマン英語", cmpUs: "Lingorain", cmpThem: "通学型レッスン",
  cmpRows: [["料金", "講師プロフィールで確認", "スクールによる"], ["時間", "オンラインで空き枠を確認", "固定スケジュールが中心"], ["場所", "ブラウザから受講", "通学が必要"], ["講師選び", "プロフィールを見て自分で選ぶ", "スクールによる"], ["予約方法", "必要なレッスンを1回ずつ予約", "回数券の場合あり"]],
  revTitle: "学習者の声", reviews: [
    { name: "Sato Yuki", from: "東京", text: "仕事のあとにレッスンを予約でき、自分のペースでビジネス英語を練習できています。", goal: "ビジネス英語" },
    { name: "田中 健", from: "大阪", text: "日本語で文法を確認できる講師を選べました。目標に沿ったレッスンで学びやすいです。", goal: "日常英会話" },
    { name: "小林 美咲", from: "名古屋", text: "子どもが読み聞かせやゲーム形式の練習を気に入っています。毎週のレッスンを楽しみにしています。", goal: "キッズ英語" },
  ],
  faqTitle: "よくある質問", faq: [
    ["体験レッスンの料金は？", "体験レッスンを提供している講師は、プロフィールに料金を表示します。予約確定前に金額をご確認ください。"],
    ["講師が来なかった場合は？", "予約情報を添えてサポートへご連絡ください。予約履歴とレッスン規定を確認して対応します。"],
    ["レッスンのキャンセルはできますか？", "可能です。予約ページとレッスン詳細で、適用される期限や返金条件をご確認ください。"],
    ["アプリのインストールは必要ですか？", "不要です。ブラウザから教室に入り、カメラとマイクを許可してください。"],
    ["講師として登録するには？", "講師アカウントを作成し、プロフィールとレッスン可能時間を設定してください。"],
  ],
  ctaTutorTitle: "Lingorainの英語講師になりませんか", ctaTutorText: "プロフィールで経験やレッスン料金、スケジュールを紹介できます。",
  ctaTutorPoints: ["レッスン料金を設定", "空き時間を管理", "講師ダッシュボードで予約と収入を確認"], ctaTutorBtn: "講師アカウントを作成",
  finalTitle: "次の英語レッスンを始めませんか", finalBtn: "講師を探す",
};

const en: Home = {
  badge: "One-to-one English tutoring for Chinese & Japanese learners",
  h1a: "Find an English tutor", h1b: "who fits your life",
  sub: "Learn one-to-one with English tutors from around the world. From IELTS prep and workplace communication to your child’s first lesson, find the right fit. No fixed schedule. No guesswork.",
  heroProof: "Trusted by learners across China & Japan",
  searchGoal: "Choose your learning goal", searchBtn: "Find a tutor", searchPlaceholder: "Tutor name or keyword",
  popular: "Popular goals",
  stats: [["2,000+", "English tutors"], ["1.2M+", "Lessons taught"], ["4.9 / 5", "Average lesson rating"], ["30+", "Tutor countries & regions"]],
  trust: "IELTS · TOEFL · TOEIC · Business English · Kids English · Conversation",
  goalsTitle: "A tutor for every goal", goalsSub: "Search by what you want to achieve, then choose a tutor whose teaching style fits you.",
  goals: [
    { tag: "Conversation", title: "Conversation", text: "Speak more naturally and confidently" },
    { tag: "IELTS", title: "IELTS prep", text: "Focused support for all four skills" },
    { tag: "TOEFL", title: "TOEFL prep", text: "Academic English and study abroad" },
    { tag: "TOEIC", title: "TOEIC prep", text: "Build practical workplace English" },
    { tag: "Business", title: "Business English", text: "Meetings, presentations and emails" },
    { tag: "Kids", title: "Kids English", text: "Fun lessons that build confidence" },
    { tag: "Pronunciation", title: "Pronunciation", text: "Sound clearer and more natural" },
    { tag: "Interview", title: "Interview prep", text: "Practice with focused feedback" },
  ],
  detailTitle: "A lesson built around you", detailSub: "From booking to class to review, every step is designed around your goals.",
  details: [
    { kicker: "Tailored", title: "Lessons shaped around your goals", text: "Message your tutor before you book to share your level and what you want to work on. They prepare materials for you — not a one-size-fits-all script.", bullets: ["Chat with your tutor before booking", "Prep for IELTS, business, speaking and more", "Get the tutor’s notes after each lesson"], stat: "100%", statLabel: "One-to-one lessons", image: detailImages.tutor, alt: "A tutor teaching a one-to-one online English lesson" },
    { kicker: "Flexible", title: "On your schedule, in your timezone", text: "See each tutor’s real availability, automatically converted to your local time. No fixed bundles — book as many or as few lessons as you like.", bullets: ["Times shown in Beijing or Tokyo time", "Book a lesson as soon as two hours out", "Pay per lesson, no long-term packages"], stat: "24/7", statLabel: "Slots to choose from", image: detailImages.schedule, alt: "Planning English lesson times on a calendar" },
    { kicker: "Rewarding", title: "Progress you can actually see", text: "Review every lesson, tutor note and message in your learner dashboard, so you always know where you stand. Rate your tutor after each completed lesson.", bullets: ["Manage all lessons in one dashboard", "Revisit past lessons and tutor notes", "Rate and review after a lesson"], stat: "4.9/5", statLabel: "Average lesson rating", image: detailImages.study, alt: "A learner taking English study notes at home" },
  ],
  kidsTitle: "Make English the best part of their day", kidsSub: "Meet the Lingorain learning crew. Reading, speaking, writing, listening, matching words and solving puzzles—six ways to learn by doing.", kidsCta: "Find an English tutor for your child",
  characters: [
    { name: "Birdie", activity: "Storytime", text: "Read a picture book together and meet new words along the way.", image: characterFiles.birdie, alt: "Birdie reading a picture book and learning an English letter" },
    { name: "Teddy", activity: "Speaking practice", text: "Say it out loud, try new sounds and build everyday confidence.", image: characterFiles.teddy, alt: "Teddy practicing spoken English" },
    { name: "Lulu", activity: "Writing", text: "Start with letters, then spell words and write simple sentences.", image: characterFiles.lulu, alt: "Lulu practicing writing English letters" },
    { name: "Nini", activity: "Listening", text: "Tune in to English sounds, pronunciation and natural rhythm.", image: characterFiles.nini, alt: "Nini wearing headphones and listening to English" },
    { name: "Momo", activity: "Word matching", text: "Match pictures to words and make new vocabulary stick.", image: characterFiles.momo, alt: "Momo matching picture cards with English words" },
    { name: "Piki", activity: "Word puzzle", text: "Build English words one letter at a time with hands-on play.", image: characterFiles.piki, alt: "Piki solving a vocabulary puzzle with letter tiles" },
  ],
  tutorsTitle: "Tutors learners love", tutorsSub: "Explore tutor profiles, lesson topics, schedules and student feedback.",
  howTitle: "Your next lesson is three steps away", howSub: "A clear, simple path from finding a tutor to joining class.",
  steps: [
    { title: "Choose a tutor", text: "Browse tutors by goal, price, accent and languages spoken." },
    { title: "Pick a time", text: "Choose an available slot shown in your local timezone." },
    { title: "Learn online", text: "Join your one-to-one video classroom right in your browser." },
  ],
  promiseTitle: "Learn with peace of mind", promiseSub: "We keep the rules clear so you can focus on learning.",
  promises: [
    { value: "50%", title: "Trial lesson", text: "Eligible tutors offer a half-price trial — try before you commit." },
    { value: "Held", title: "Protected payments", text: "Your payment is held safely and released to the tutor after class." },
    { value: "12h", title: "Free cancellation", text: "Cancel up to 12 hours before — refunds return to your wallet." },
    { value: "Vetted", title: "Real tutors", text: "Tutor profiles are reviewed, and only real students can review them." },
  ],
  whyTitle: "Why Lingorain", whySub: "More choice, clear lesson details and a booking flow designed around learners.",
  why: [
    { title: "A tutor who fits your goals", text: "Filter by subject, price, accent and Mandarin or Japanese support." },
    { title: "A schedule that works", text: "See real tutor availability and book in your local timezone." },
    { title: "Book one lesson at a time", text: "No fixed lesson bundles. Pay for the lessons you choose." },
    { title: "Try before you commit", text: "Eligible tutors list a discounted trial lesson on their profile." },
    { title: "Clear cancellation terms", text: "Review the lesson and cancellation details before booking." },
    { title: "Reviews from real students", text: "Students can review their experience after a completed lesson." },
  ],
  cmpTitle: "A more flexible way to learn English", cmpUs: "Lingorain", cmpThem: "Traditional classes",
  cmpRows: [["Lesson pricing", "See tutor pricing up front", "Varies by school"], ["Schedule", "Choose an available online slot", "Often fixed"], ["Location", "Learn online in your browser", "Travel to a classroom"], ["Tutor choice", "Compare profiles and choose", "Often assigned"], ["Commitment", "Book lessons as you need them", "Packages may apply"]],
  revTitle: "Learner stories", reviews: [
    { name: "Li Wei", from: "Shanghai", text: "I can find a tutor who understands my goals and book around work. That makes it much easier to keep practicing.", goal: "Conversation" },
    { name: "Sato Yuki", from: "Tokyo", text: "I can book after work and focus on practical business English at my own pace.", goal: "Business English" },
    { name: "Mrs. Chen", from: "Beijing", text: "My child enjoys the reading and interactive activities. Each lesson is clear and suited to their level.", goal: "Kids English" },
  ],
  faqTitle: "Frequently asked questions", faq: [
    ["How much is a trial lesson?", "Tutors who offer a trial show its price on their profile. You can review the full price before confirming a booking."],
    ["What if my tutor doesn't show up?", "Contact support with your booking details. We’ll review the lesson record and applicable booking terms."],
    ["Can I cancel a lesson?", "Yes. Check the cancellation deadline and refund terms shown with your booking and lesson details."],
    ["Do I need to install an app?", "No. Join the classroom in your browser and allow camera and microphone access."],
    ["How do I become a tutor?", "Create a tutor account, complete your profile and set your teaching availability."],
  ],
  ctaTutorTitle: "Teach English with Lingorain", ctaTutorText: "Showcase your experience, lesson pricing and availability to learners in China and Japan.",
  ctaTutorPoints: ["Set your own lesson prices", "Manage your availability", "Track bookings and earnings in your tutor dashboard"], ctaTutorBtn: "Create a tutor account",
  finalTitle: "Ready to make your next move in English?", finalBtn: "Browse tutors",
};

export const HOME: Record<Lang, Home> = { zh, ja, en };
