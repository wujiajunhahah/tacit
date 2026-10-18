// Murmur demo data and post markup, shared by feed.html, status.html, profile.html and demo/build.ts.
// Every post renders through render(), so the X-style markup contract is identical everywhere.
// No DOM access here: Bun loads this file at build time.
(function (root) {
  'use strict';

  // Fixed "now" for the demo, so relative times never drift.
  var NOW = Date.UTC(2026, 9, 17, 16, 0, 0);
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var RELEVANT = { agents: 'AI agents and context', decisions: 'Fast decisions, latency and calibration' };

  var people = {
    alex_rivera: { name: 'Alex Rivera', bio: 'Reading more than I post.', joined: 'June 2020', following: 286, followers: 141 },
    mara_builds: { name: 'Mara Lindqvist', bio: 'Building browser agents that remember where you have been. Previously search infrastructure.', joined: 'March 2019', following: 412, followers: 8930 },
    theo_ships: { name: 'Theo Okafor', bio: 'Product engineer. Small tools for people who read a lot.', joined: 'August 2016', following: 733, followers: 12410 },
    priya_ux: { name: 'Priya Raman', bio: 'Interface designer. Adaptive layouts, honest defaults.', joined: 'January 2018', following: 520, followers: 6720 },
    jonas_w: { name: 'Jonas Weber', bio: 'ML engineer. Retrieval, ranking and the occasional rant about context.', joined: 'May 2015', following: 301, followers: 4180 },
    lenaf: { name: 'Lena Fischer', bio: 'HCI researcher. How people hand context to machines.', joined: 'October 2014', following: 640, followers: 15200 },
    dev_castillo: { name: 'Dev Castillo', bio: 'Agent infrastructure: permissions, logs, undo.', joined: 'February 2021', following: 198, followers: 2950 },
    sami_k: { name: 'Sami Kallio', bio: 'Writes about tools for thinking.', joined: 'July 2017', following: 455, followers: 3870 },
    hana_latency: { name: 'Hana Sato', bio: 'Performance engineer. Every millisecond is a design decision.', joined: 'April 2016', following: 270, followers: 5480 },
    ravi_calibrates: { name: 'Ravi Menon', bio: 'Calibration nerd. If it says 0.8, it should mean 0.8.', joined: 'September 2019', following: 388, followers: 3310 },
    elif_demir: { name: 'Elif Demir', bio: 'Data scientist. Decision models, experiments, plots.', joined: 'November 2020', following: 412, followers: 2760 },
    kofi_mensah: { name: 'Kofi Mensah', bio: 'Fast models for interfaces. System 1 enthusiast.', joined: 'March 2022', following: 233, followers: 4020 },
    gusparker_fc: { name: 'Gus Parker', bio: 'Northgate United till I die. Opinions mine and usually wrong.', joined: 'August 2012', following: 1210, followers: 3400 },
    beabakes: { name: 'Bea Moreno', bio: 'Home baker. Butter, flour, chaos.', joined: 'May 2018', following: 690, followers: 9100 },
    nicoroams: { name: 'Nico Hart', bio: 'Slow travel, fast trains.', joined: 'June 2013', following: 802, followers: 7700 },
    celestegossip: { name: 'Celeste Vane', bio: 'All the tea, none of the sugar.', joined: 'February 2015', following: 95, followers: 88400 },
    moonbag_maxi: { name: 'Moonbag Maxi', bio: 'Not financial advice. Barely advice.', joined: 'December 2021', following: 4100, followers: 23900 },
    larkspurcoffee: { name: 'Larkspur Coffee', bio: 'Small-batch roasters since 2014.', joined: 'March 2014', following: 120, followers: 18300 },
    fernandfield: { name: 'Fern & Field', bio: 'Plants, pots and good soil.', joined: 'April 2019', following: 64, followers: 11200 },
    kitemobile: { name: 'Kite Mobile', bio: 'Phones that last the whole weekend.', joined: 'January 2017', following: 12, followers: 140500 },
    weatherdesk_north: { name: 'Northport Weather', bio: 'Forecasts for Northport and the coast.', joined: 'October 2011', following: 40, followers: 61000 },
    dadjokes_daily: { name: 'Daily Dad Jokes', bio: 'One groan a day.', joined: 'June 2014', following: 2, followers: 305000 },
    olu_runs: { name: 'Olu Bakare', bio: 'Running slowly, often.', joined: 'March 2020', following: 310, followers: 880 },
    rosaplates: { name: 'Rosa Lind', bio: 'Cooking for one, generously.', joined: 'September 2016', following: 444, followers: 5200 },
    tess_hoops: { name: 'Tess Hooper', bio: 'Basketball, coffee, more basketball.', joined: 'November 2015', following: 530, followers: 1900 },
    joelpike: { name: 'Joel Pike', bio: 'Comedian on weekends, accountant on weekdays.', joined: 'July 2012', following: 720, followers: 41800 },
    wendy_tran: { name: 'Wendy Tran', bio: 'Carry-on only. Window seat always.', joined: 'May 2017', following: 380, followers: 6400 },
    yuki_paws: { name: 'Yuki Mori', bio: 'Two cats, one opinion.', joined: 'August 2018', following: 260, followers: 19700 },
    quinn_tv: { name: 'Quinn Abara', bio: 'Watching too much television so you do not have to.', joined: 'January 2016', following: 610, followers: 12900 },
  };

  // [handle, topic, minutes ago, replies, reposts, likes, text]. Topics other than agents/decisions are noise.
  // Links use [label](href).
  var initialRows = [
    ['gusparker_fc', 'football', 4, 48, 212, 1904, `NORTHGATE UNITED IN THE 94TH MINUTE. I am not okay. I will never be okay. Someone check on the man behind me who hugged a stranger and then a police horse.`],
    ['weatherdesk_north', 'weather', 11, 6, 41, 133, `Heads up, Northport: heavy rain moving in from the coast around 4pm, with gusts up to 60 km/h on the bridges. Leave a little extra time for the evening commute.`],
    ['theo_ships', 'agents', 19, 64, 318, 2471, `I copy-pasted 23 pages into a chatbot today. Didn't actually read a single one of them myself.\n\nAt some point you have to admit you're not using AI. You're its clipboard.`],
    ['beabakes', 'food', 26, 22, 15, 389, `Third attempt at laminated dough. Butter leaked everywhere, the croissants look like small crabs, and I still ate four of them standing over the tray.`],
    ['hana_latency', 'decisions', 34, 31, 147, 1120, `400 ms is the number I keep coming back to. Under it, a suggestion feels like part of your gesture. Over it, it feels like a popup that interrupted you. Same feature, different product.`],
    ['celestegossip', 'gossip', 41, 380, 905, 6420, `So Ava Sterling and Jett Rowan unfollowed each other AND archived the matching tattoo photos?? Within ten minutes of each other?? The group chat is on fire.`],
    ['larkspurcoffee', 'promo', 53, 3, 9, 74, `New season roast just landed: Ridgeline. Notes of dark cherry, cocoa and a little woodsmoke. 15% off all weekend for subscribers.`],
    ['mara_builds', 'agents', 58, 87, 402, 3108, `Hot take: the bottleneck for AI agents isn't intelligence, it's context.\n\nMy agent can't see the tab I'm on, doesn't know how I got there, has no idea what I tried ten minutes ago. So every session starts from zero and I narrate my own life to it.`],
    ['moonbag_maxi', 'crypto', 66, 57, 88, 640, `$MOONCAT down 40% this week. Diamond paws. We are so back (next week). (Probably.) (Not financial advice.)`],
    ['ravi_calibrates', 'decisions', 74, 19, 52, 488, `Calibration check on our link ranker: when it says 0.8 it's right 79% of the time on held-out clicks. When it says 0.95, only 88%. Overconfident at the top, as always. Temperature scaling, here we come.`],
    ['nicoroams', 'travel', 88, 14, 30, 512, `Lisbon tip nobody tells you: the old trams are charming, but your calves will do most of the sightseeing. Wear real shoes. Thank me later.`],
    ['priya_ux', 'agents', 97, 26, 133, 1265, `Interfaces that adapt to what you're doing beat interfaces you have to learn. Spent the afternoon prototyping a reading view that highlights only the paragraphs that answer the search you came from. The rest just fades back.`],
    ['dadjokes_daily', 'jokes', 110, 12, 140, 980, `I told my computer I needed a break, and it said "No problem, I'll go to sleep."`],
    ['olu_runs', 'running', 124, 40, 12, 702, `Ran 10k this morning without stopping for the first time. Lungs on fire, legs made of wet sand, grinning like an idiot. Worth it.`],
    ['dev_castillo', 'agents', 139, 18, 96, 844, `Browser agents are great right up until they need to know what you already looked at. We keep rebuilding the user's history from scratch inside the prompt, one paste at a time.`],
    ['kofi_mensah', 'decisions', 151, 23, 167, 1388, `Fast decision models are a different product category. They don't write. They pick one of N options and tell you how sure they are.\n\nThat's exactly the shape of most UI decisions: which link, which paragraph, which button.`],
    ['rosaplates', 'food', 166, 61, 77, 1490, `A good tomato, flaky salt and olive oil beats most restaurant starters and I will not be taking questions.`],
    ['tess_hoops', 'basketball', 180, 33, 21, 655, `Buzzer beater from the corner to force overtime and then we lose by 11. This sport is a prank and I keep falling for it.`],
    ['lenaf', 'agents', 196, 29, 211, 1730, `Every page you visit carries signal: the query that got you there, the link text you clicked, the sentence you selected. Most software throws all of it away.\n\nWrote up how a context harness could keep it: [Notes on a context harness](article.html)`],
    ['kitemobile', 'promo', 214, 8, 25, 190, `Meet Kite 3. Two-day battery, a camera that actually works after sunset, and a price that won't keep you up at night either. Preorders open Friday.`],
    ['elif_demir', 'decisions', 233, 17, 89, 932, `An interface that says "I'm 55% sure, is this what you meant?" is more trustworthy than one that is confidently wrong twice a day. Calibrated probabilities are a UX feature, not just a metric.`],
    ['yuki_paws', 'pets', 251, 45, 60, 2208, `My cat has decided the warm laptop is her emotional support device. I now work from the arm of the couch. We all make sacrifices.`],
    ['jonas_w', 'agents', 270, 38, 190, 1544, `Unpopular opinion: "just paste it into the chat" is the new "just email it to yourself." It works. It also means our tools still aren't talking to each other.`],
    ['gusparker_fc', 'football', 292, 26, 71, 803, `Harbor City's back line today was a revolving door at a shopping mall. Lovely to look at, nobody stopping anything.`],
    ['quinn_tv', 'tv', 311, 52, 44, 1102, `If this season of Coldwater ends on another cliffhanger I am writing a strongly worded letter to a streaming service that does not read letters.`],
    ['sami_k', 'agents', 334, 21, 103, 1291, `Watching my agent politely ask me for context it could have read straight off my screen is the most 2026 experience I've had all week.`],
    ['weatherdesk_north', 'weather', 356, 9, 63, 410, `First frost of the season tonight for inland areas. If your basil is still outside, this is its farewell tour.`],
    ['hana_latency', 'decisions', 379, 15, 74, 690, `p95 decision latency dropped from 610 ms to 290 ms after we stopped re-tokenizing the whole page on every scroll event. Profile before you optimize, then profile again.`],
    ['celestegossip', 'gossip', 401, 140, 310, 4022, `Spotted: a certain pop star leaving last night's premiere through the restaurant kitchen. Sunglasses. At 11pm. Babe, we can still see you.`],
    ['priya_ux', 'agents', 426, 34, 155, 1407, `Design question I can't shake: if the interface reshapes itself around my intent, how do I know what it hid from me?\n\nFolding needs reasons, not silence.`],
    ['moonbag_maxi', 'crypto', 449, 66, 240, 2890, `Me explaining to my landlord that rent is a centralized concept and I've moved to a community-governed payment model (I am not paying rent).`],
    ['wendy_tran', 'travel', 472, 13, 48, 732, `Airport lounge hack: there is no hack. Bring snacks, a scarf and low expectations, in that order.`],
    ['mara_builds', 'agents', 498, 25, 177, 1215, `The context packet idea is underrated: a compact summary of what you're doing (intent, sources, selections, open questions) handed to whatever agent you use. Portable context instead of yet another chat history.`],
    ['ravi_calibrates', 'decisions', 523, 12, 66, 571, `Reliability diagrams should be part of every product review for ML features. If the probabilities don't mean anything, don't show them to users.`],
    ['joelpike', 'jokes', 551, 39, 210, 2675, `My smart fridge has started judging me. Every time I open it after 10pm it plays a small, disappointed beep.`],
    ['theo_ships', 'agents', 577, 20, 88, 962, `Tried an extension that reads how I got to a page and suggests where to go next. First time a "recommended" link felt like it was about me and not about the page.`],
    ['fernandfield', 'promo', 604, 2, 6, 58, `Your plants called. They want brighter corners and roomier pots. Repotting kits are back in stock, soil included.`],
    ['kofi_mensah', 'decisions', 632, 27, 140, 1183, `System 1 vs System 2 for models: most UI decisions are System 1. Which link, which paragraph, which button. You don't need an essay for that. You need a reflex.`],
    ['lenaf', 'agents', 661, 44, 380, 3350, `Agents don't need more instructions. They need to know where you are and what you were doing a minute ago.`],
    ['beabakes', 'food', 690, 58, 95, 1870, `Made a 20-minute miso butter pasta tonight and I'm genuinely not sure I'll ever cook anything else. Recipe in the replies if anyone wants it.`],
  ];

  // Loaded 12 at a time by infinite scroll on the feed.
  var moreRows = [
    ['weatherdesk_north', 'weather', 726, 4, 22, 260, `Weekend outlook: sunny and 19° for Saturday's harbor market. Sunscreen, people. Yes, in October.`],
    ['jonas_w', 'agents', 751, 30, 144, 1320, `Copying the error, then the docs page, then the issue thread into a chatbot, one by one, is just data entry with extra steps.`],
    ['rosaplates', 'food', 779, 11, 19, 640, `Roasted squash, brown butter, crispy sage. Autumn in a single pan and about four dishes to wash.`],
    ['celestegossip', 'gossip', 803, 92, 133, 2210, `Jett Rowan's new album cover is just a photo of an empty parking lot at dusk and honestly? Art. Healing. Confusing. Art.`],
    ['elif_demir', 'decisions', 829, 19, 121, 1044, `Act when sure, ask when not, stay quiet otherwise. Wrote it on a sticky note during a design review and it settled three arguments.`],
    ['moonbag_maxi', 'crypto', 858, 47, 160, 1760, `Bought the dip. Then the dip's dip. Then the dip's dip's dip. I am now a dip connoisseur.`],
    ['priya_ux', 'agents', 884, 22, 98, 1102, `Small thing that would change everything: when I open a search result, carry the query along so the page can highlight the part that answers it.`],
    ['nicoroams', 'travel', 911, 18, 40, 860, `Night train from Vienna: tiny bunk, terrible coffee, woke up to mountains. Ten out of ten, would rattle again.`],
    ['dadjokes_daily', 'jokes', 939, 9, 88, 701, `Why did the scarecrow get promoted? He was outstanding in his field.`],
    ['dev_castillo', 'agents', 968, 16, 112, 977, `My rule for adaptive UIs: personal presentation is fine, but "confirmed" and "done" must mean exactly the same thing on every screen.`],
    ['gusparker_fc', 'football', 996, 12, 18, 402, `Derby day tomorrow. Scarf washed, voice ready, expectations carefully lowered.`],
    ['ravi_calibrates', 'decisions', 1024, 21, 93, 802, `Temperature scaling took our expected calibration error from 0.11 to 0.03. About twenty lines of code. Do it before you ship confidence scores.`],

    ['larkspurcoffee', 'promo', 1062, 1, 4, 41, `Cold mornings call for the Harbor blend: chocolate, toasted almond, zero drama. Free delivery on orders over two bags.`],
    ['yuki_paws', 'pets', 1090, 28, 71, 1922, `My cat has learned to open the snack cupboard. I have learned to fear silence.`],
    ['lenaf', 'agents', 1121, 24, 130, 1188, `Spent a week logging my own browsing context: queries, the links I followed, what I selected and copied. It's a remarkably good summary of what I was actually trying to do. Better than my notes.`],
    ['quinn_tv', 'tv', 1149, 15, 12, 455, `Started a new baking competition show and within one episode I had strong opinions about a stranger's lemon curd.`],
    ['hana_latency', 'decisions', 1180, 14, 102, 870, `Latency budget for one UI reflex: read the page 30 ms, infer intent 40, rank 60, ask the model 200, paint 16. Whatever's left is slack, and you will need the slack.`],
    ['olu_runs', 'running', 1207, 10, 7, 330, `Rain run. My socks will never recover. Neither will my faith in the forecast.`],
    ['mara_builds', 'agents', 1238, 31, 208, 1902, `Agents that act in the browser need an undo button more than they need a smarter planner.`],
    ['beabakes', 'food', 1266, 36, 25, 1210, `Croissant attempt number four: layers! Actual layers! I'm framing one of them.`],
    ['tess_hoops', 'basketball', 1297, 8, 10, 290, `Double overtime on a Tuesday. Our defense is more of a suggestion box.`],
    ['theo_ships', 'agents', 1325, 17, 95, 740, `The calibrated-reflex library is public now. Rank a few options, get a probability for each, abstain when unsure: [tacit-labs/reflex](repo.html)`],
    ['kofi_mensah', 'decisions', 1356, 12, 79, 688, `Multiple choice is an underrated interface to models. Fixed options, one probability each, no prose to hallucinate. Easy to log, easy to evaluate, easy to undo.`],
    ['kitemobile', 'promo', 1384, 6, 3, 37, `Trade in any phone, even the one with the cracked corner you've been ignoring, and get up to 200 off Kite 3.`],

    ['joelpike', 'jokes', 1421, 20, 155, 2045, `Asked the barista for something strong. She told me to believe in myself.`],
    ['sami_k', 'agents', 1460, 26, 172, 1410, `A chatbot that sees my whole screen is creepy. A local ledger of what I did, that I can read, correct and delete, is useful. Same data, different contract.`],
    ['weatherdesk_north', 'weather', 1502, 5, 37, 300, `Wind advisory for the coast road until 6am. Secure bins, patio furniture and any optimism about your umbrella.`],
    ['celestegossip', 'gossip', 1549, 210, 120, 3300, `Ava Sterling just posted a photo of two coffee cups and no caption. Two. Cups. I have been staring at it for an hour.`],
    ['elif_demir', 'decisions', 1601, 11, 64, 590, `Decision latency is the new page load time. Nobody benchmarks it yet, which means it is about to matter a lot.`],
    ['wendy_tran', 'travel', 1655, 22, 66, 1200, `Booked a 6am flight to save money and now I'm paying for it in a currency called sleep.`],
    ['jonas_w', 'agents', 1712, 35, 150, 1290, `If your agent has to ask "what are you working on?" the interface has already failed. It was watching the whole time.`],
    ['moonbag_maxi', 'crypto', 1770, 40, 92, 1050, `$SPROUT just flipped $MOONCAT and I'd like to announce I have always been a $SPROUT person. Since this morning.`],
    ['rosaplates', 'food', 1830, 17, 30, 900, `Leftover rice, two eggs, a sad scallion and some soy. Best meal of the week, cost nothing, took eight minutes.`],
    ['priya_ux', 'agents', 1891, 19, 87, 1015, `Prototype: select a sentence and the page offers to jump to the two sections that build on it. Feels like the document finally noticed I was reading it.`],
    ['ravi_calibrates', 'decisions', 1955, 9, 44, 512, `Show me your reliability diagram and I'll tell you whether your confidence badge is a feature or a decoration.`],
    ['fernandfield', 'promo', 2018, 3, 11, 96, `Pothos: the plant that forgives you for everything. Even that. Especially that. Back in stock this week.`],
  ];

  var REPLY_TEXT = {
    agents: [
      `This is exactly my week. I'm a very well-paid clipboard.`,
      `The part about narrating your own life to it is too real.`,
      `Would love this as something that runs locally and forgets on command.`,
      `Context over cleverness. Every single time.`,
      `We hit the same wall. The model was fine; it just never knew what the user had already seen.`,
      `Folding with a reason is such a good idea. Silence is what makes personalization feel creepy.`,
      `Saving this for our next design review.`,
      `Counterpoint: half my context is tabs I opened by accident.`,
    ],
    decisions: [
      `Calibration plots or it didn't happen.`,
      `What does your p95 look like on a cold start?`,
      `Most underrated idea in applied ML right now.`,
      `We saw the same thing: people forgive a wrong guess if the confidence was honest.`,
      `Abstaining is a feature. More systems should be allowed to say "not sure."`,
      `Curious how you measure this in the field without logging too much.`,
      `Fast and slightly wrong beats slow and perfect for anything inside a click.`,
      `Printing this and taping it to the monitor.`,
    ],
    noise: [
      `Ha! Accurate.`,
      `Absolutely not, but I respect it.`,
      `Saving this.`,
      `Same thing happened to me last week.`,
      `This is the content I'm here for.`,
      `I feel personally attacked.`,
      `Every. Single. Time.`,
      `Laughed out loud on the bus. Thanks for that.`,
      `Can't stop thinking about this.`,
      `Sending this to the group chat immediately.`,
    ],
  };
  var REPLIERS = ['alex_rivera', 'theo_ships', 'priya_ux', 'jonas_w', 'lenaf', 'sami_k', 'hana_latency', 'elif_demir',
    'olu_runs', 'wendy_tran', 'rosaplates', 'yuki_paws', 'joelpike', 'quinn_tv'];

  function toPost(row, index) {
    return {
      id: idFor(index, 0),
      index: index,
      user: row[0],
      topic: row[1],
      relevant: Object.prototype.hasOwnProperty.call(RELEVANT, row[1]),
      mins: row[2],
      replies: row[3],
      reposts: row[4],
      likes: row[5],
      text: row[6],
    };
  }

  // Snowflake-style ids: 19 digits, newer posts get larger ids. Replies use the 18461 prefix.
  function idFor(index, reply) {
    return (reply ? '18461' : '18460') + String(99999999999999 - index * 104729 - reply).padStart(14, '0');
  }

  var all = initialRows.concat(moreRows).map(toPost);
  var initial = all.slice(0, initialRows.length);
  var more = all.slice(initialRows.length);

  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /** Three or four deterministic replies per post. Replies have no replies of their own. */
  function repliesFor(post) {
    if (post.parent) return [];
    var seed = hash(post.id);
    var pool = REPLY_TEXT[post.relevant ? post.topic : 'noise'];
    var n = 3 + (seed % 2);
    var list = [];
    for (var k = 0; k < n; k++) {
      var user = REPLIERS[(seed + k * 5) % REPLIERS.length];
      if (user === post.user) user = REPLIERS[(seed + k * 5 + 1) % REPLIERS.length];
      list.push({
        id: idFor(post.index, k + 1),
        parent: post.id,
        user: user,
        topic: post.topic,
        relevant: post.relevant,
        mins: Math.max(1, Math.round(post.mins * (1 - (k + 1) / (n + 2)))),
        replies: (seed + k) % 4,
        reposts: (seed >>> k) % 6,
        likes: 3 + ((seed * (k + 3)) % 140),
        text: pool[(seed + k * 3) % pool.length],
      });
    }
    return list;
  }

  var byId = null;
  function find(id) {
    if (!byId) {
      byId = {};
      all.forEach(function (post) {
        byId[post.id] = post;
        repliesFor(post).forEach(function (reply) { byId[reply.id] = reply; });
      });
    }
    return Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null;
  }

  function byUser(handle) {
    return all.filter(function (post) { return post.user === handle; });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Escaped text with [label](href) links. */
  function rich(text) {
    return esc(text).replace(/\[([^\]]+)\]\(([\w./?=&#-]+)\)/g, '<a href="$2">$1</a>');
  }

  function iso(mins) {
    return new Date(NOW - mins * 60000).toISOString();
  }

  function ago(mins) {
    if (mins < 60) return mins + 'm';
    if (mins < 1440) return Math.floor(mins / 60) + 'h';
    var d = new Date(NOW - mins * 60000);
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
  }

  function count(n) {
    return n < 1000 ? String(n) : (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }

  /** The one markup contract for a post. Attribute values are verbatim from X's timeline. */
  function render(post) {
    var name = esc(people[post.user].name);
    return '<article data-testid="tweet" role="article" tabindex="0">\n' +
      '  <div data-testid="User-Name"><a href="profile.html?u=' + post.user + '"><span>' + name + '</span></a> <span>@' + post.user +
      '</span> · <a href="status.html?id=' + post.id + '"><time datetime="' + iso(post.mins) + '">' + ago(post.mins) + '</time></a></div>\n' +
      '  <div data-testid="tweetText" lang="en">' + rich(post.text) + '</div>\n' +
      '  <div role="group"><button data-testid="reply">' + count(post.replies) + '</button><button data-testid="retweet">' +
      count(post.reposts) + '</button><button data-testid="like">' + count(post.likes) + '</button></div>\n' +
      '</article>';
  }

  root.Murmur = {
    now: NOW,
    relevantTopics: RELEVANT,
    batchSize: 12,
    people: people,
    initial: initial,
    more: more,
    all: all,
    find: find,
    byUser: byUser,
    repliesFor: repliesFor,
    render: render,
    count: count,
    esc: esc,
  };
})(globalThis);
