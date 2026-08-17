// Kiko's detection corpus.
//
// test-detection.js proves that what once broke stays fixed — every case in it
// was added after a bug. This file is the other thing: a standing measurement
// of how good detection is, across the kinds of text people actually type.
//
// Structure follows the nineteen dataset categories in the 4.8.6 audit brief.
//
//   silent    text that is already correct. Kiko must say nothing. A hit here
//             is the expensive kind of mistake: offering to turn what somebody
//             wrote into gibberish, in front of them, mid-sentence.
//
//   spans     wrong-layout text sitting inside correct text, with the exact
//             substring Kiko should replace. Detection being right is not
//             enough — converting one word too many destroys a word the user
//             typed on purpose. This section is what makes that measurable.
//
//   long      whole paragraphs, for latency and for runs long enough to reach
//             the recall bubble rather than the toast.
//
//   learned   words a user has personally rejected, and what must follow.
//
// The wrong-layout halves of the per-language sets are generated in
// test-quality.js by running the correct sentences through the extension's own
// layout tables — which is exactly what a keyboard produces when the layout is
// wrong, and avoids a second hand-maintained copy drifting from the first.
//
// HONEST LIMIT: these sentences are written, not harvested. They are realistic
// rather than real, and I am not a native speaker of five of the six
// languages. Numbers computed from them are a floor, not a truth. Replacing
// any block with genuine text — old messages, sent email, anything typed
// naturally — makes the measurement better and requires no other change.

module.exports = {

  // ── Correct text. Kiko must stay silent on all of it. ─────────────────
  silent: {

    // B–H: correct text in each supported language.
    he: [
      'שלום, מה שלומך היום',
      'אני אשלח לך את הקובץ בהמשך היום',
      'תודה רבה על העזרה, זה ממש עזר לי',
      'אפשר לקבוע פגישה לשבוע הבא',
      'הזמנתי כבר את הכרטיסים לטיסה',
      'מתי אתה חוזר מהעבודה היום',
      'שכחתי את המפתחות בבית של אמא',
      'הילדים חוזרים מבית הספר בארבע',
      'צריך לקנות חלב ולחם בדרך הביתה',
      'הפגישה נדחתה למחר בבוקר',
      'אני לא בטוח שהבנתי את השאלה',
      'תשלח לי הודעה כשאתה מגיע',
      'סליחה על האיחור, היה פקק בכביש',
      'בוא נדבר על זה בטלפון מאוחר יותר',
      'קיבלתי את המייל שלך, אענה בקרוב',
      'הכל בסדר, אין מה לדאוג',
      'אני מחפש דירה להשכרה באזור המרכז',
      'כמה זה עולה בסך הכל',
      'נתראה מחר בשעה שמונה בערב',
      'הרופא אמר שצריך לנוח כמה ימים',
      'אפשר לשלם בכרטיס אשראי או במזומן',
      'שלחתי לך את הפרטים בהודעה נפרדת',
      'אני עובד מהבית ביום ראשון',
      'החשבון עדיין לא שולם',
      'תודה על התשובה המהירה',
      'יש לי שאלה לגבי ההזמנה שלי',
      'הכתובת היא רחוב הרצל שלושים ושתיים',
      'אשמח לשמוע ממך בהקדם',
      'הישיבה תתקיים בחדר הישיבות בקומה השנייה',
      'זה לא דחוף, אפשר גם מחר',
      'תעדכן אותי כשיהיה משהו חדש',
      'אני בפגישה, אחזור אליך אחר כך',
    ],

    ru: [
      'Привет, как дела сегодня',
      'Я отправлю тебе файл позже вечером',
      'Спасибо большое за помощь',
      'Можем ли мы назначить встречу на следующей неделе',
      'Я уже заказал билеты на самолёт',
      'Когда ты возвращаешься с работы',
      'Забыл ключи дома у мамы',
      'Дети возвращаются из школы в четыре',
      'Нужно купить молоко и хлеб по дороге домой',
      'Встреча перенесена на завтра утром',
      'Я не уверен, что понял вопрос',
      'Напиши мне, когда приедешь',
      'Цена включает налог и доставку',
      'Извините за опоздание, была пробка',
      'Давай обсудим это по телефону позже',
      'Я получил ваше письмо и скоро отвечу',
      'Всё в порядке, не о чем беспокоиться',
      'Я ищу квартиру в центре города',
      'Сколько это стоит вместе с доставкой',
      'Увидимся завтра в восемь вечера',
      'Врач сказал, что нужно отдохнуть несколько дней',
      'Можно заплатить картой или наличными',
      'Я отправил подробности отдельным сообщением',
      'В воскресенье я работаю из дома',
      'Счёт до сих пор не оплачен',
      'Это не срочно, можно и завтра',
      'Я на встрече, перезвоню позже',
    ],

    uk: [
      'Привіт, як справи сьогодні',
      'Я надішлю тобі файл пізніше ввечері',
      'Дуже дякую за допомогу',
      'Чи можемо ми призначити зустріч наступного тижня',
      'Я вже замовив квитки на літак',
      'Коли ти повертаєшся з роботи',
      'Забув ключі вдома у мами',
      'Діти повертаються зі школи о четвертій',
      'Треба купити молоко і хліб дорогою додому',
      'Зустріч перенесли на завтра вранці',
      'Я не впевнений, що зрозумів питання',
      'Напиши мені, коли приїдеш',
      'Ціна включає податок і доставку',
      'Вибачте за запізнення, була пробка',
      'Давай обговоримо це телефоном пізніше',
      'Я отримав ваш лист і скоро відповім',
      'Усе гаразд, немає про що хвилюватися',
      'Я шукаю квартиру в центрі міста',
      'Скільки це коштує разом із доставкою',
      'Побачимось завтра о восьмій вечора',
      'Це не терміново, можна і завтра',
      'Я на зустрічі, передзвоню пізніше',
    ],

    ko: [
      '안녕하세요 오늘 어떻게 지내세요',
      '파일은 오늘 저녁에 보내드리겠습니다',
      '도와주셔서 정말 감사합니다',
      '다음 주에 회의를 잡을 수 있을까요',
      '비행기 표는 이미 예약했습니다',
      '오늘 언제 퇴근하세요',
      '엄마 집에 열쇠를 두고 왔어요',
      '아이들은 네 시에 학교에서 돌아옵니다',
      '집에 가는 길에 우유와 빵을 사야 해요',
      '회의가 내일 아침으로 미뤄졌습니다',
      '질문을 제대로 이해했는지 모르겠어요',
      '도착하면 문자 주세요',
      '가격에는 세금과 배송비가 포함되어 있습니다',
      '늦어서 죄송합니다 길이 막혔어요',
      '이건 나중에 전화로 이야기합시다',
      '메일 잘 받았습니다 곧 답장드릴게요',
      '괜찮아요 걱정하지 않으셔도 됩니다',
      '시내에 있는 아파트를 찾고 있습니다',
      '배송비까지 하면 전부 얼마인가요',
      '내일 저녁 여덟 시에 봐요',
      '급하지 않아요 내일도 괜찮습니다',
      '지금 회의 중이라 나중에 연락드릴게요',
    ],

    el: [
      'Γεια σου, τι κάνεις σήμερα',
      'Θα σου στείλω το αρχείο αργότερα σήμερα',
      'Ευχαριστώ πολύ για τη βοήθεια',
      'Μπορούμε να κανονίσουμε ραντεβού την επόμενη εβδομάδα',
      'Έχω ήδη κλείσει τα εισιτήρια για την πτήση',
      'Πότε γυρίζεις από τη δουλειά',
      'Ξέχασα τα κλειδιά στο σπίτι της μαμάς',
      'Τα παιδιά γυρίζουν από το σχολείο στις τέσσερις',
      'Πρέπει να πάρω γάλα και ψωμί στον δρόμο',
      'Η συνάντηση αναβλήθηκε για αύριο το πρωί',
      'Δεν είμαι σίγουρος ότι κατάλαβα την ερώτηση',
      'Στείλε μου μήνυμα όταν φτάσεις',
      'Η τιμή περιλαμβάνει φόρο και μεταφορικά',
      'Συγγνώμη για την καθυστέρηση, είχε κίνηση',
      'Ας το συζητήσουμε στο τηλέφωνο αργότερα',
      'Έλαβα το email σου και θα απαντήσω σύντομα',
      'Όλα καλά, μην ανησυχείς',
      'Ψάχνω διαμέρισμα στο κέντρο της πόλης',
      'Πόσο κοστίζει συνολικά με τα μεταφορικά',
      'Θα τα πούμε αύριο στις οκτώ το βράδυ',
      'Δεν είναι επείγον, μπορεί και αύριο',
      'Είμαι σε σύσκεψη, θα σε πάρω μετά',
    ],

    ar: [
      'مرحبا كيف حالك اليوم',
      'سأرسل لك الملف في وقت لاحق اليوم',
      'شكرا جزيلا على المساعدة',
      'هل يمكننا تحديد موعد الأسبوع القادم',
      'لقد حجزت تذاكر الطيران بالفعل',
      'متى تعود من العمل اليوم',
      'نسيت المفاتيح في بيت أمي',
      'يعود الأطفال من المدرسة في الرابعة',
      'يجب شراء الحليب والخبز في الطريق',
      'تم تأجيل الاجتماع إلى صباح الغد',
      'لست متأكدا أنني فهمت السؤال',
      'أرسل لي رسالة عندما تصل',
      'السعر يشمل الضريبة والتوصيل',
      'آسف على التأخير كان هناك ازدحام',
      'دعنا نتحدث عن هذا على الهاتف لاحقا',
      'استلمت بريدك وسأرد قريبا',
      'كل شيء على ما يرام لا داعي للقلق',
      'أبحث عن شقة للإيجار في وسط المدينة',
      'كم يكلف هذا في المجموع',
      'أراك غدا في الثامنة مساء',
      'الأمر ليس عاجلا يمكن غدا',
      'أنا في اجتماع سأتصل بك لاحقا',
    ],

    // C: ordinary English, including the punctuation-heavy kind. On the Hebrew
    // layout the comma key is ת and the full stop is ש, so a sentence full of
    // commas is precisely where a careless rule starts firing on correct text.
    en: [
      'please send me the file tomorrow morning',
      'can you upload the file to the shared folder',
      'i will review the document and get back to you',
      'lets schedule a meeting for next week to discuss the project',
      'the customer support team has been notified about this issue',
      'download the latest version and restart your browser',
      'thanks a lot for helping with this design work',
      'my phone number and contact details are attached below',
      'we need to confirm the shipping address before payment',
      'hello world this is a test of the system',
      'the quick brown fox jumps over the lazy dog',
      'check the file permissions and try again later today',
      'i think the new keyboard and mouse are on the desk',
      'are you free for lunch on thursday',
      'what time does the meeting start tomorrow',
      'the invoice has already been paid in full',
      'could you please confirm you received this email',
      'the flight lands at half past six in the evening',
      'i left my keys at my mothers house again',
      'we should buy milk and bread on the way home',
      'the children come back from school at four',
      'sorry i am late there was traffic on the motorway',
      'lets talk about it on the phone later this afternoon',
      'everything is fine there is nothing to worry about',
      'i am looking for a flat to rent in the city centre',
      'how much does it cost including delivery',
      'see you tomorrow at eight in the evening',
      'the doctor said i should rest for a few days',
      'you can pay by card or in cash',
      'i sent you the details in a separate message',
      'i am working from home on sunday',
      'the bill has still not been paid',
      'thank you for the quick reply',
      'i have a question about my order',
      'the address is thirty two herzl street',
      'looking forward to hearing from you soon',
      'the meeting will be in the second floor boardroom',
      'go do that and let me know how it goes',
      'she said she would call back in an hour',
      'we ran out of paper for the printer again',
      'yes, i can do that, but not before friday',
      'well, that depends on what you mean, exactly',
      'first, check the cable; second, restart the machine',
      'no, thanks, i already ate.',
      'ok, sounds good, talk later.',
      'so, what did they say about the price?',
      'right, i see, that makes sense now',
      'sure, send it over, i will look tonight',
      'hi, hope you are well, just following up on my last email',
      'the meeting, as far as i know, is still on.',
      'anyway, let me know, and we can sort it out.',
      'actually, i think, on reflection, that is fine.',
      'sorry, one more thing, can you cc me on that',
      'perfect, thanks, that is exactly what i needed.',
      'hmm, not sure, let me check and get back to you.',
    ],

    // I: real multilingual writing. Nobody writes one language at a time.
    // The four marked (brief) are verbatim from the audit brief.
    mixed: [
      'שלחתי לך את ה deck ב-Slack',                          // brief
      'תבדוק ב Salesforce אם ה opportunity עדיין פתוח',       // brief
      'I spoke with יוסי yesterday',                          // brief
      'אני עובד עכשיו על the new campaign',                   // brief
      'תעלה את זה ל Google Drive בבקשה',
      'צריך לעדכן את ה pipeline לפני ה QBR',
      'שלח לי את ה link בווטסאפ',
      'Отправил тебе invite в Zoom',
      'нужно закрыть этот ticket до конца дня',
      'давай созвонимся после standup',
      '내일 미팅 전에 deck 좀 봐주세요',
      'PR 리뷰 부탁드립니다 오늘 안에',
      'Θα σου στείλω το link στο Slack',
      'أرسل لي الـ link على الواتساب',
      'the קובץ is in the shared drive',
      'I will send the חשבונית tomorrow',
    ],

    // J: names and brands, the classic false-positive trap — they obey no
    // dictionary and often look like nothing in any language.
    names: [
      'Yossi and Dvir met Sarah',
      'Ravit called Noa about the contract',
      'ask Shlomi or Tal to review it',
      'Dmitri and Oksana are joining the call',
      'Minjun and Seoyeon will present',
      'Nikos and Eleni are on the thread',
      'Slack Notion Figma Salesforce',
      'we use Jira Confluence and Bitbucket',
      'HubSpot Zapier Airtable Retool',
      'compare Stripe Paddle and Lemon Squeezy',
      'Kubernetes Terraform Grafana Prometheus',
      'Anthropic OpenAI Mistral Cohere',
      'send it via WhatsApp or Telegram',
      'the Zoom link is in the calendar invite',
    ],

    // K: URLs. A path is a run of unspaced letters and looks like anything.
    urls: [
      'check https://github.com/anthropics/claude-code please',
      'the docs are at https://developer.chrome.com/docs/extensions',
      'see http://localhost:3000/admin/settings for the config',
      'https://get-kiko.com/he/ is the hebrew page',
      'go to chrome://extensions and reload it',
      'the repo is github.com/itays2050/claude',
      'read https://en.wikipedia.org/wiki/Keyboard_layout first',
      'https://app.lemonsqueezy.com/my-orders to cancel',
      'try www.example.co.il/products/12345',
      'the CDN is at cdn.jsdelivr.net/npm/package@1.2.3',
    ],

    // L: email addresses.
    emails: [
      'send it to itay@selltech.io tomorrow',
      'cc hello@get-kiko.com on the reply',
      'my work address is first.last@company.co.il',
      'forward it to support@lemonsqueezy.com please',
      'the alias is no-reply@mail.example.com',
      'write to a.b.c@sub.domain.org instead',
    ],

    // M: technical terms and code-adjacent prose.
    technical: [
      'the API returns a 404 when the id is missing',
      'run npm install and then npm run build',
      'set NODE_ENV to production before deploying',
      'the SQL query needs an index on user_id',
      'git rebase onto main and force push with lease',
      'the CSS uses flexbox and a media query',
      'we should memoize that selector in redux',
      'the webhook payload is JSON over HTTPS',
      'increase the timeout to thirty seconds',
      'the container OOMed under load',
    ],

    // R: actual code, which people paste into text fields constantly.
    code: [
      'const foo = bar.map(x => x.id)',
      'if (!user) { return res.status(401).json({ error: true }) }',
      'SELECT id, name FROM users WHERE active = 1',
      'git commit -m "fix the thing" && git push',
      'docker run -p 8080:80 nginx:alpine',
      'export PATH=$PATH:/usr/local/bin',
      'def handler(event, context): return {"ok": True}',
      '.container { display: grid; gap: 12px; }',
      'curl -X POST https://api.example.com/v1/things',
      'npx wrangler deploy --env production',
    ],

    // N: abbreviations and acronyms — short, vowel-poor, dictionary-invisible.
    abbreviations: [
      'the CRM and the API need SSO',
      'send the PDF and the CSV to HR',
      'ETA is 15:30 UTC per the SLA',
      'the CEO CTO and CFO are all in',
      'check the KPIs in the QBR deck',
      'B2B SaaS ARR MRR CAC LTV',
      'PR CI CD QA UAT prod',
      'FYI the RFP is due EOD',
      'asap pls ty',
      'IMO the ROI is not there yet',
    ],

    // O: slang and casual writing, which no dictionary contains.
    slang: [
      'lol thats sick bro',
      'omg no way that happened',
      'idk maybe later tbh',
      'yeah nah im good thanks',
      'brb gonna grab coffee',
      'thats wild lmao',
      'ngl that was pretty good',
      'fr fr no cap',
      'wanna grab lunch later',
      'gimme a sec im almost done',
    ],

    // P: very short messages, where there is almost no evidence either way.
    short: [
      'ok',
      'hi there',
      'yes please',
      'no thanks',
      'on it',
      'will do',
      'sure thing',
      'got it',
      'me too',
      'see you',
      'thank you',
      'good luck',
    ],
  },

  // ── Wrong-layout text inside correct text ─────────────────────────────
  //
  // Detection being right is not sufficient. If the replaced span runs one
  // word too far, accepting the fix destroys a word the user typed on purpose,
  // and that is the outcome the whole false-positive priority exists to
  // prevent. `expect` is the exact substring Kiko should replace.
  //
  // `null` means Kiko should stay silent: there is not enough wrong-layout
  // text to justify touching anything.
  spans: [
    { typed: 'I spoke with akuo nv akunl yesterday', expect: 'akuo nv akunl' },
    { typed: 'the akuo nv file',                     expect: 'akuo nv' },
    { typed: 'akuo nv akunl and then I left',        expect: 'akuo nv akunl' },
    { typed: 'Slack akuo nv akunl',                  expect: 'akuo nv akunl' },
    { typed: 'send akuo nv to me',                   expect: 'akuo nv' },
    { typed: 'akuo nv akunl vhuo',                   expect: 'akuo nv akunl vhuo' },
    { typed: 'I said ghbdtn rfr to him',             expect: 'ghbdtn rfr' },
    { typed: 'he wrote dkssud gksrnr there',         expect: 'dkssud gksrnr' },
    { typed: 'akuo, nv akunl vhuo',                  expect: 'akuo, nv akunl vhuo' },
    // A single wrong-layout word is never enough on its own.
    { typed: 'send akuo to me',                      expect: null },
    { typed: 'the ghbdtn file',                      expect: null },
  ],

  // ── Q: long paragraphs, for latency and for the recall bubble ─────────
  long: {
    en: Array(12).fill(
      'please review the attached document and let me know if anything looks wrong before we send it to the client tomorrow morning'
    ).join(' '),
    he: Array(12).fill(
      'אני מעביר לך את המסמך המצורף ואשמח שתעבור עליו ותגיד לי אם משהו לא נראה בסדר לפני שנשלח אותו ללקוח מחר בבוקר'
    ).join(' '),
  },

  // ── S: user-created learned exceptions ────────────────────────────────
  //
  // A rejected word is a promise: never flag this again. The promise has to
  // hold, and it has to hold without silencing the words around it.
  learned: {
    // Reject these, then the text below must behave as stated.
    reject: ['akuo', 'nv'],
    thenSilent: [
      'akuo nv',
      'akuo nv akunl',        // the two rejected words no longer form a run
    ],
    thenStillFires: [
      'ghbdtn rfr',           // a different language is unaffected
      'dkssud gksrnr',
    ],
  },
};
