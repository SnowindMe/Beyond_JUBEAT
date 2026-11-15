    // 服务器切换 + 搜索 + 四维筛选 + 五种排序（2026-10-23，t9）。
    // 只改 hidden 与 CSS order，不写 localStorage、不动 URL、不重排 DOM。
    //
    // 【第一件事：让工具条显形】本脚本以 defer 外链（2026-11-15 P2 从页面内联搬出来），
    // 比 HTML 解析晚跑。CSS 里 .sc-find/.sc-panel/.sc-active 默认 display:none，
    // 只认 html.sc-js —— 挂类放在这里，才不会出现"工具条已亮、点着一个都不动"的死控件窗口。
    // 原先这行在页首的内联脚本里，那时脚本紧跟 <section> 执行、本来就没有窗口；
    // 改成 defer 之后同一个写法反而变糟，所以搬过来。
    document.documentElement.classList.add('sc-js');

    // 三条硬原则：
    //  1) 匹配字段一律读 data-*（data-t / data-a / data-id / data-gen / data-bsc / data-adv / data-ext），
    //     不在输入时解析卡片文本——文本里混着「双」徽章、被截断的省略号、破折号占位，解析必然是脏数据。
    //  2) 排序用 CSS order（grid/flex 都支持），1248 张卡重排 DOM 会掉帧、滚动位置也会跳。
    //  3) 定数缺失是空串而不是 0：区间筛选时直接判不命中，绝不把它当 0 塞进「7.0 以下」。
    (function () {
      // .sc-js 已在页首的内联脚本里挂好（见文件开头那条 script），这里不再重复加。

      // 默认排序值：与页面顶部 DEFAULT_SORT 保持一致。
      // is:inline 脚本不经过 Astro 编译，取不到前端常量，只能在这里再写一次；
      // 改排序默认值时**两处都要改**（这是本项目唯一允许的重复，因为技术上限如此）。
      var DEFAULT_SORT_INLINE = 'id-asc';

      // 【2026-10-30 血的教训：又一个"取不到 Astro 常量"的坑】
      // 服务端顶部新加的 const DIFF_NONE = '' 在这里**根本不存在** ——
      // is:inline 脚本原样输出到浏览器，不参与 Astro 的模块作用域。
      // 结果 matchCard 里一引用就抛 ReferenceError，apply() 在第一张卡就中断，
      // 表现为「点了 chip 高亮变了、但列表纹丝不动，提示条还是 0」。
      // 所以在 inline 脚本内必须**重新声明一份本地常量**，与上面 DEFAULT_SORT_INLINE 同理。
      // 判据：任何在 is:inline  <script> 里出现的标识符，都必须能在这个 IIFE 内找到定义，
      // 否则它一定来自服务端模板 —— 而那是拿不到的。
      var DIFF_NONE_INLINE = '';

      var root = document.getElementById('songsRoot');
      if (!root) return;

      var srvBtns = root.querySelectorAll('.sc-srv-b');
      var sets = root.querySelectorAll('.sc-cat-set');
      // 范围 chip 组（PICK UP / COMMON）：与分区 chips 同构，两服各一套，切服时显隐
      var scopeSets = root.querySelectorAll('.sc-scope-set');
      var bodies = root.querySelectorAll('.sc-body');
      var search = document.getElementById('scSearch');
      var clearBtn = document.getElementById('scClear');
      var panelBtn = document.getElementById('scFilterBtn');
      var panel = document.getElementById('scPanel');
      var sortSel = document.getElementById('scSort');
      var filterTxt = document.getElementById('scFilterTxt');
      var emptyBox = document.getElementById('scEmpty');
      var loadingBox = document.getElementById('scLoading');
      var activeBox = document.getElementById('scActive');
      var activeTxt = document.getElementById('scActiveTxt');
      var activeCost = document.getElementById('scCost');
      var activeCostTxt = document.getElementById('scCostTxt');

      var state = {
        srv: root.getAttribute('data-srv') || 'jp',
        cat: 'all',
        q: '',
        gen: 'all',
          diff: '',     // '' = 不按难度档筛 | bsc | adv | ext
        band: 'all',   // all | lt7 | 7 | 8 | 9 | 9p | 10 | 10p（2026-10-28 改八档）
        scope: 'all',  // all | pick | common（与分区正交的第二维，判据是卡片的 data-scope）
        showLimited: false, // 2026-10-28：显示限时曲，默认关（已结束的限时曲不混进常规列表）
        type: 'all',   // all | std | hold | alt2（2026-10-31 谱面类型，见卡片 data-hh / data-alt）
        sort: DEFAULT_SORT_INLINE,
        // 排列方式（2026-11-14）：grid = 卡片（默认）/ list = 列表。
        // 它是纯视图偏好，不进 matchCard、不改卡片集合，只翻 #songsRoot 的 data-view。
        view: 'grid'
      };

      // ---------------------------------------------------------------------
      // 【2026-10-30 主人要求「做一下保存筛选条件」】把筛选状态存进 localStorage。
      //
      // 设计取舍（重要，改之前先读）：
      //  · 存「筛选/排序/搜索/服务器」，**不存滚动位置**。滚动位置由浏览器自己恢复，
      //    我们再插手容易和 SPA 式的历史恢复打架。
      //  · 只在**用户主动改动**后写盘（apply() 里统一写），页面初始化读盘时不再回写，
      //    避免"读出来又存回去"的死循环，也不会把默认值覆盖成脏数据。
      //  · 版本号 KEY_VER 参与 key 名：以后字段增减直接升版本，旧数据自然废弃，
      //    不用写迁移逻辑，也不会因为读到旧结构而报错。
      //  · 读盘必须 try/catch 并逐字段校验：localStorage 可能被用户/扩展写脏，
      //    一个 null 或非法枚举值就能让 matchCard 全判否、整页空白。
      //  · 「重置全部」会清掉存档——那是用户的明确意图，不是误操作。
      // ---------------------------------------------------------------------
      var SAVE_KEY = 'jb-songs-filter-v1';
      // 白名单：只恢复这些字段，且每个都校验取值合法。多余字段一律丢弃。
      var SAVE_FIELDS = {
        srv: ['jp', 'cn'],
        cat: null,          // 分区名随服务器不同，只校验是字符串，交给 apply 去判
        q: null,            // 搜索词任意字符串
        gen: null,
        diff: ['', 'bsc', 'adv', 'ext'],
        band: ['all', 'lt7', '7', '8', '9', '9p', '10', '10p'],
        scope: ['all', 'pick', 'common'],
        showLimited: ['boolean'],
        type: ['all', 'std', 'hold', 'alt2'],
        sort: ['id-asc', 'id-desc', 'ext-desc', 'ext-asc', 't-asc', 't-desc'],
        // 排列方式跨服务器、跨会话保留（主人 2026-11-14：切服务器也要保留），所以进存档。
        view: ['grid', 'list']
      };

      function loadSaved() {
        var raw;
        try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return; }
        if (!raw) return;
        var obj;
        try { obj = JSON.parse(raw); } catch (e) { return; }
        if (!obj || typeof obj !== 'object') return;
        for (var k in SAVE_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          var v = obj[k];
          var rule = SAVE_FIELDS[k];
          if (rule && rule[0] === 'boolean') {
            if (typeof v === 'boolean') state[k] = v;
          } else if (rule) {
            if (typeof v === 'string' && rule.indexOf(v) !== -1) state[k] = v;
          } else {
            if (typeof v === 'string') state[k] = v;
          }
        }
      }

      // 重置期间临时禁用落盘：见 resetAll() 里的说明
      var suppressSave = false;

      function saveState() {
        if (suppressSave) return;
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify({
            srv: state.srv, cat: state.cat, q: state.q, gen: state.gen,
            diff: state.diff, band: state.band,
            scope: state.scope, showLimited: state.showLimited,
            type: state.type, sort: state.sort, view: state.view
          }));
        } catch (e) { /* 隐私模式/配额满：静默跳过，不影响使用 */ }
      }

      /** 把读回来的 state 同步到所有控件上（chip / 下拉 / 搜索框 / 复选框）。
       *  顺序必须在第一次 apply() 之前——否则页面会先按默认值渲染一遍再跳变。 */
      function syncControlsFromState() {
        if (search) search.value = state.q || '';
        if (clearBtn) clearBtn.hidden = !state.q;
        var limBox = document.getElementById('scLimited');
        if (limBox) limBox.checked = !!state.showLimited;
        var sSel = document.getElementById('scSort'); if (sSel) sSel.value = state.sort;
        var gSel = document.getElementById('scGen'); if (gSel) gSel.value = state.gen;
        var tySel = document.getElementById('scType'); if (tySel) tySel.value = state.type;
        function pick(sel, attr, val) {
          var nodes = root.querySelectorAll(sel);
          for (var i = 0; i < nodes.length; i++) {
            var hit = nodes[i].getAttribute(attr) === val;
            nodes[i].classList.toggle('is-on', hit);
            nodes[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
          }
        }
        pick('[data-diff]', 'data-diff', state.diff);
        pick('[data-band]', 'data-band', state.band);
        pick('.sc-cat-set[data-srv="' + state.srv + '"] .sc-chip', 'data-cat', state.cat);
        pick('.sc-scope-set[data-srv="' + state.srv + '"] .sc-chip', 'data-scope', state.scope);
        ddRefresh();
      }

      // 定数区间：与页面上那八档按钮一一对应，改这里必须同步改模板里的 BANDS。
      // 语义见文件上方 BANDS 定义的注释（7 / 8 是整段，9 / 10 各拆 X 与 X+ 半段）。
      var BANDS = {
        lt7: function (v) { return v < 7; },
        '7': function (v) { return v >= 7 && v < 8; },
        '8': function (v) { return v >= 8 && v < 9; },
        '9': function (v) { return v >= 9 && v < 9.5; },
        '9p': function (v) { return v >= 9.5 && v < 10; },
        '10': function (v) { return v >= 10 && v < 10.5; },
        '10p': function (v) { return v >= 10.5; }
      };

      // 【2026-10-28 限时曲】卡片的 data-lu 是限时结束日（YYYY-MM-DD），空串 = 非限时。
      // 主人定的口径：「看区间是否仍在有效期内」——结束日 < 今天 才算限时曲。
      // 关键：今天必须是**运行时**的真日期，不能在构建期算好写进 HTML
      // （那样数据一生成就固定，第二天起永远错）。
      // 用字符串比较即可：YYYY-MM-DD 是字典序 = 时间序，不必建 Date 对象。
      var TODAY = (function () {
        var d = new Date();
        var m = ('0' + (d.getMonth() + 1)).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        return d.getFullYear() + '-' + m + '-' + day;
      })();
      function isEndedLimited(card) {
        var lu = card.getAttribute('data-lu');
        if (!lu) return false;                  // 没限时区间：常态曲
        return lu < TODAY;                      // 结束日已过 = 限时曲（默认隐藏）
      }

      // 取某张卡在当前难度档下的定数。null = 这张卡没有这一档（不是 0）
      function lvOf(card, diff) {
        var raw = card.getAttribute('data-' + diff);
        if (raw === null || raw === '') return null;
        var n = Number(raw);
        return isNaN(n) ? null : n;
      }

      // 【2026-10-30 主人要求「搜索适配假名·罗马字」】
      // 一张卡能被搜到，靠两种串：原文（data-t/data-a，含空格与大小写原样）与
      // 读音索引 data-sk（平假名+罗马字，已去空白并小写，见 scripts/build-search-key.cjs）。
      // 查询串因此要试三种形态，任一命中即算匹配：
      //   q          原样          —— 打「bass 2 bass」「10.5」靠它
      //   qNoSpace   去空白        —— 「senbon sakura」也能对上 sk 里的 senbonsakura
      //   qKana      去空白+片假名归一到平假名 —— 打「カメリア」能对上读音里的「かめりあ」
      //     （只对片假名做归一：读音串统一存平假名，反方向由 data-t 原文兜住）
      // 只在输入变化时算一次，挂在 qFormsCache 上；别放进 matchCard，那会每张卡都重算一遍。
      var qFormsCache = { src: null, forms: [] };
      function queryForms() {
        if (qFormsCache.src === state.q) return qFormsCache.forms;
        var q = state.q || '';
        var noSpace = q.replace(/[\s\u3000]+/g, '');
        var kana = noSpace.replace(/[\u30A1-\u30F6\u30F7-\u30FA]/g, function (ch) {
          var code = ch.charCodeAt(0);
          return String.fromCharCode(code <= 0x30F6 ? code - 0x60 : 0x308F + (code - 0x30F7));
        });
        var forms = [q];
        if (noSpace !== q) forms.push(noSpace);
        if (kana && wIndexOf(forms, kana) === -1) forms.push(kana);
        qFormsCache = { src: state.q, forms: forms };
        return forms;
      }
      function wIndexOf(arr, v) {
        for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i;
        return -1;
      }

      function matchCard(card, bodySrv) {
        // 【2026-10-28】限时曲默认不显示：勾了「显示限时曲」才放行。
        // 放在最前面短路，省掉后面一串字符串比较。
        if (!state.showLimited && isEndedLimited(card)) return false;
        if (state.q) {
          // 匹配 曲名 / 曲师 / songId 三个字段（任务书①），外加 data-lv 的三档定数：
          // 用户常直接打「10.5」找这个定数的歌，只搜前三个字段会一无所获。
          var hay = (card.getAttribute('data-t') || '').toLowerCase() + '\n' +
                    (card.getAttribute('data-a') || '').toLowerCase() + '\n' +
                    (card.getAttribute('data-id') || '').toLowerCase() + '\n' +
                    (card.getAttribute('data-lv') || '').toLowerCase();
          // 读音索引（假名/罗马字）：多数卡的 data-sk 是空串，取一次就够，别在循环里反复 getAttribute。
          var sk = (card.getAttribute('data-sk') || '').toLowerCase();
          var forms = queryForms();
          var matched = false;
          for (var fi = 0; fi < forms.length && !matched; fi++) {
            matched = hay.indexOf(forms[fi]) !== -1 ||
                      (sk !== '' && sk.indexOf(forms[fi]) !== -1);
          }
          if (!matched) return false;
        }
        // 分区过滤（2026-10-24 改）：DOM 只有一套「按世代整合」的节点，
        // 选具体分区时靠这里隐藏不属于该分区的卡片，而不是另渲染一份结构。
        // 「全部」= 不分区、所有卡片都露出来。
        // 分区名要按**该 body 自己的服务器**解析：cn 的分区是 独占/KONAMI/原创/流行，
        // jp 的是授权/原创。state.cat 里的分区名只对当前 srv 有意义。
        // bodySrv 在这里真正用上（2026-10-24 稽核指出它在函数体内 0 引用）：
        // 只有当该 body 的服务器与当前视图一致时，state.cat 才是有效的筛选条件；
        // 对隐藏 body，state.cat 可能属于另一个服务器的分区名，此时不该按它过滤（否则会把它自己的卡全判否）。
        var catApplies = state.cat !== 'all' && bodySrv === state.srv;
        if (catApplies && card.getAttribute('data-cat') !== state.cat) return false;
        // 范围过滤（2026-10-25）：data-scope 是服务端按 isPickUp() 算好的，前端只比字符串。
        // 与分区一样，只在「该 body 就是当前视图」时才有意义——state.scope 里的 pick/common
        // 是按当前服务器的口径算的，拿去筛隐藏 body 会得出另一套结果。
        if (state.scope !== 'all' && bodySrv === state.srv &&
            card.getAttribute('data-scope') !== state.scope) return false;
        if (state.gen !== 'all' && card.getAttribute('data-gen') !== state.gen) return false;

        // 谱面类型（2026-10-31 主人要求）：两条独立判据，都在卡片属性上。
        //   data-hh：'1' 有长按 / '0' 确认没有 / '' 库里未知（不在 RemyWiki 榜单的曲）。
        //            STD 用 hh !== '1'（把未知算进来）而不是 hh === '0'——主人拍板：
        //            选 STD / HOLD 要能覆盖全库，未知行不该两边都看不到。
        //   data-alt：'1' 是 [ 2 ] 谱面变体。[ 2 ] ≠ 长押，两者别混。
        if (state.type !== 'all') {
          var hh = card.getAttribute('data-hh') || '';
          if (state.type === 'std') {
            if (hh === '1') return false;
          } else if (state.type === 'hold') {
            if (hh !== '1') return false;
          } else if (state.type === 'alt2') {
            if (card.getAttribute('data-alt') !== '1') return false;
          }
        }

        // ---- 难度档 + 定数区间 ----
        //
        // 【2026-10-30 重写：删掉「全部档」时顺带修了一个 P0】
        //
        // 旧逻辑是：
        //   if (state.diff === 'all') return true;   ← 致命短路
        //   var v = lvOf(card, state.diff); ...
        // 那句 return true 排在「定数区间」判断**之前**，于是「'全部档' + 选了 10+」
        // 会直接命中所有卡 —— 表现为「只点定数区间完全不生效」（实测命中 1150 首，
        // 正确值 147），但提示条仍显示「筛选 · 1」，看着像生效了。
        //
        // 现在的语义分三种情况，互不短路：
        //   ① 没选难度档、没选定数区间   → 这一段不过滤（继续往下，最终 return true）
        //   ② 选了难度档、没选定数区间   → 该档有值即命中
        //   ③ 选了定数区间（无论有没有选难度档）→ 在候选档位里找，任一档的定数值落在区间内即命中
        // 情况③是这次真正修好的地方：定数区间可以独立使用，不再被难度档绑架。
        var bandOn = state.band !== 'all';
        var diffOn = state.diff !== DIFF_NONE_INLINE && state.diff !== 'all';

        if (!bandOn && !diffOn) return true;            // ① 两者都没选

        if (diffOn) {
          var vOne = lvOf(card, state.diff);
          if (vOne === null) return false;              // ② 缺这一档：不命中
          return bandOn ? BANDS[state.band](vOne) : true;
        }

        // ③ 只选了定数区间：BSC/ADV/EXT 任一档落在区间内就算命中。
        // 注意「缺这一档」的卡（定数为 null）不算命中——空串不是 0，不能拿去比区间。
        var diffs = ['bsc', 'adv', 'ext'];
        for (var di = 0; di < diffs.length; di++) {
          var vAny = lvOf(card, diffs[di]);
          if (vAny !== null && BANDS[state.band](vAny)) return true;
        }
        return false;
      }

      // ---- 排序：只写 style.order ----
      function sortCards(cards) {
        var arr = [];
        for (var i = 0; i < cards.length; i++) arr.push(cards[i]);
        var mode = state.sort;

        if (mode === 'id-asc' || mode === 'id-desc') {
          // songId 排序（2026-10-25 主人要求）。
          // **必须按数值比，不能 localeCompare**：songId 是「8 位日服 / 9 位国服」两种长度，
          // 按字符串比会得出 "991000007" < "11000228"（因为 '9' > '1' 但长度短），
          // 与用户对「升序」的直觉完全相反。日服占位 id（BTA-xxxxxx）不是纯数字，
          // 用 data-id-kind 也判不出来，这里统一走「能解析成数字就按数字，否则按字符串兜底」，
          // 非数字的一律排在数字后面（与「缺 EXT 排最后」同一套约定）。
          arr.sort(function (a, b) {
            var ia = a.getAttribute('data-id') || '';
            var ib = b.getAttribute('data-id') || '';
            var na = /^\d+$/.test(ia) ? Number(ia) : null;
            var nb = /^\d+$/.test(ib) ? Number(ib) : null;
            if (na === null && nb !== null) return 1;
            if (nb === null && na !== null) return -1;
            var c;
            if (na === null && nb === null) c = ia.localeCompare(ib);
            else c = na - nb;
            if (c === 0) c = (a.getAttribute('data-t') || '').localeCompare(b.getAttribute('data-t') || '');
            return mode === 'id-desc' ? -c : c;
          });
        } else if (mode === 't-asc' || mode === 't-desc') {
          arr.sort(function (a, b) {
            var c = (a.getAttribute('data-t') || '').localeCompare(b.getAttribute('data-t') || '');
            return mode === 't-desc' ? -c : c;
          });
        } else {
          arr.sort(function (a, b) {
            var va = lvOf(a, 'ext'), vb = lvOf(b, 'ext');
            // 缺 EXT 的永远排最后（升序降序都一样），避免 -1 跑到最前
            if (va === null && vb !== null) return 1;
            if (vb === null && va !== null) return -1;
            if (va === null && vb === null) {
              return (a.getAttribute('data-t') || '').localeCompare(b.getAttribute('data-t') || '');
            }
            var d = mode === 'ext-asc' ? va - vb : vb - va;
            if (d !== 0) return d;
            return (a.getAttribute('data-t') || '').localeCompare(b.getAttribute('data-t') || '');
          });
        }
        for (var n = 0; n < arr.length; n++) arr[n].style.order = String(n);
      }

      // 【2026-10-30 简化】原来这里有一段「世代 新→旧」的专门分支：
      // 给 .sc-sec 切 flex、按 data-date 倒序写 .sc-gen 的 order、并把块内卡片 order 清空。
      // 主人已要求删掉那个排序项，整段随之删除。
      // 留下的唯一职责：对每个可见网格内的卡片写 order —— 注意**不碰 .sc-gen 的 order**，
      // 世代块的先后始终由 DOM 顺序（GEN_ORDER 旧→新）决定。
      //
      // 【2026-11-13 加跳过判据（同上：点 X 清除搜索的卡顿）】
      // 这个函数每次 apply 都给**全部**卡片写一遍 style.order。实测写 1683 个 order 本身只要 ~19ms，
      // 但它让整份样式失效，紧接着的那次重排里样式重算 257~417ms —— 而绝大多数 apply
      // （清除搜索、切分区、切服务器）根本没换排序方式、也没来新卡，这一遍是纯白工。
      // 所以记住「上次排序用的 state.sort + 哪台服务器」，两者都没变就直接跳过。
      // 为什么不必跟踪「来过新卡」：loadFrag 落地时已经对该块自己的网格跑过一次 sortCards
      // （order 是每个 .sc-grid 内部各自生效的，新块不会打乱别的网格）；
      // 切服带 srv 进 key，因为这里只给可见 body 的网格排序，另一套得等它现身再排。
      var sortApplied = '';
      function applySort() {
        var tag = state.sort + '|' + state.srv;
        if (tag === sortApplied) return;
        sortApplied = tag;
        var genBlocks = root.querySelectorAll('.sc-gen');
        for (var k = 0; k < genBlocks.length; k++) genBlocks[k].style.order = '';
        var grids = root.querySelectorAll('.sc-body:not([hidden]) .sc-grid');
        for (var g = 0; g < grids.length; g++) {
          sortCards(grids[g].querySelectorAll('.sc-card'));
        }
      }

      // ---- 主流程 ----
      function apply() {
        /* 【2026-11-02 分段加载的前置条件】
           搜索 / 筛选 / 排序都是对 **DOM 卡片** 读 data-* 做的，而骨架块里没有卡片：
           不先补拉，命中数会凭空少一截，空态还会误报「没有找到符合条件的曲目」。
           所以只要「有筛选条件 + 还有骨架块」，就先补拉再算。

           三条边界：
             · lazyState === 1（正在补拉）：直接返回，补拉结束会自己再调一次 apply，
               否则这里会被连续触发、把补拉请求也放大好几倍；
             · 首屏那次 apply（无筛选）**不触发**补拉，否则懒加载等于不存在；
             · 只补拉一次（成功后 lazyState = 2），失败也不再重试，避免死循环。 */
        /* 【2026-11-02 晚修「查询要等一会才出结果」】
           原先这里是「一旦要补拉就直接 return」，于是整个补拉期（14 段 SSR，好网 0.7s、
           冷网更久）用户的每一次输入都被吞掉，页面上只有一条「正在加载剩余 N 个世代」，
           看着像卡住。现在改成：补拉只启动一次（lazyState 守卫），但**不拦着往下算** ——
           已经加载出来的卡片先按条件算一遍立刻出结果，等补拉完再算一次把数字补全。
           代价是补拉期间的数字偏小（骨架块里没有卡片可匹配，故这一段不计数），
           这是有意的：宁可先给个量级，也不要让输入框看起来没反应。 */
        if (lazyState === 0 && hasFilters() && hasSkeletons()) {
          lazyState = 1;
          /* 这里的「…」与「正在加载剩余 N 个世代」原先是就地写的，但同一个 apply 往下走
             两屏之后会把它们覆盖成本轮数字与耗时（那里的判据改用 pendingLoad 了）。
             同一份信息两处写、还有一处是错的，所以只留下面那一处，这里只管状态。 */
          ensureAll().then(function () {
            lazyState = 2;
            apply();
          }).catch(function () { lazyState = 2; });
        }
        // 耗时从「用户操作」到「列表已更新」为准，取 performance.now() 的差值。
        // 注意只能量到 JS 这一层（改 hidden / 写 CSS order），不含浏览器重绘与图片解码 ——
        // 那部分浏览器不给我们回调，所以条上写「耗时 Xms」指的是**筛选计算**的耗时，
        // 不是「页面看起来变快的那一瞬」，别把它当 FPS 指标用。
        var t0 = performance.now();
        root.setAttribute('data-srv', state.srv);
        // 【2026-10-30】把当前服务器同步到 <html data-srv-pref>。
        // 那条属性被 songs.css 的规则引用（首帧就隐藏另一套 body，防止刷新年闪日服）。
        // 如果切服时不更新它，CSS 会一直压着用户刚切过去的那套 body —— 表现为「点了国服没反应」。
        // 所以这里每次都跟随 state 写一次，CSS 与 JS 两套机制始终指向同一个服务器。
        if (document.documentElement.getAttribute('data-srv-pref') !== state.srv) {
          document.documentElement.setAttribute('data-srv-pref', state.srv);
        }

        for (var i = 0; i < srvBtns.length; i++) {
          var on = srvBtns[i].getAttribute('data-srv') === state.srv;
          srvBtns[i].classList.toggle('is-on', on);
          srvBtns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        for (var j = 0; j < sets.length; j++) {
          sets[j].hidden = sets[j].getAttribute('data-srv') !== state.srv;
        }
        for (var j2 = 0; j2 < scopeSets.length; j2++) {
          scopeSets[j2].hidden = scopeSets[j2].getAttribute('data-srv') !== state.srv;
        }

        // totalMine = **当前服务器**的命中数，给「命中 N 首」提示条与空态判断用。
        //
        // 历史坑（2026-10-24）：早先遍历所有 body（含隐藏的）时用过两服之和 total，
        // 但两服之间有 1 首共同曲名（Big Daddy）+ 13 位共同曲师（C-Show / Yooh / kors k …），
        // 搜这些时两服之和会是当前服务器的 2 倍 —— 实测提示条显示「命中 3 首」而卡片只有 2 张。
        // 所以现在只保留「当前服务器」这一个累计量；不需要「两服总命中」这个概念
        // （空态与提示条都以当前视图为准，藏着的那个 body 用户看不到）。
        var totalMine = 0;
        // 遍历**所有** body（含隐藏的）：切服后原来只更新当前 body，
        // 导致另一个 body 的 em/h2 保留上一次的值 —— 实测「切 cn 后 h2 还是『原创』、em 还是 925 首」，
        // 「cn 回全部后 em 显示 1150 首」（串了 jp 的总数）。隐藏的 body 也要各自按自己的数据重算，
        // 这样它一被显示出来就是对的，不会残留跨服串值。
        for (var k = 0; k < bodies.length; k++) {
          var body = bodies[k];
          var isMine = body.getAttribute('data-srv') === state.srv;
          body.hidden = !isMine;

          var secs = body.querySelectorAll('.sc-sec');
          for (var m = 0; m < secs.length; m++) {
            var sec = secs[m];
            // 「全部分区」= 跨分区按世代整合的单一视图（.sc-sec-all），
            // 此时所有单分区 section 一律隐藏；选具体分区时才反过来。
            // 两者互斥，避免同一世代在页面上出现两次。
            // 结构性说明（2026-10-24 前端指出）：旧的分区 section 已全部删除，
            // 页面上只剩 .sc-sec-all 一个 section，所以这里不再需要「非 all 就隐藏」的分支。

            var gens = sec.querySelectorAll('.sc-gen');
            var hitSec = 0;
            for (var g = 0; g < gens.length; g++) {
              var genEl = gens[g];
              /* 骨架块：没有卡片可匹配，但它代表 data-count 首真实曲目。
                 不走下面那套「匹配卡片」逻辑，直接按 data-count 计。
                 能走到这里说明当前没有筛选（有筛选时 apply 开头已先 ensureAll 换成真卡片）。 */
              if (genEl.className.indexOf('sc-gen-ph') !== -1) {
                // 【2026-11-02 晚】有筛选时不再一律当成「全部命中」：
                // 补拉期间每敲一个字都会走到这里，若还按 data-count 全算，
                // 命中数会先虚高（搜「りんとして」显示 1129 首）再突然掉到 1，
                // 比偏小更让人困惑。所以有筛选时先按 0 算，补拉完换成真卡片自然就对了；
                // 无筛选时仍按 data-count 出数（首屏那一刻的读数必须是对的）。
                var phCount = hasFilters() ? 0 : Number(genEl.getAttribute('data-count') || 0);
                genEl.hidden = false;
                var phCnt = genEl.querySelector('.sc-gen-h i');
                if (phCnt) phCnt.textContent = phCount + ' 首';
                hitSec += phCount;
                continue;
              }
              var cards = genEl.querySelectorAll('.sc-card');
              var hitGen = 0;
              for (var c = 0; c < cards.length; c++) {
                var ok = matchCard(cards[c], body.getAttribute('data-srv'));
                cards[c].hidden = !ok;
                if (ok) hitGen++;
              }
              genEl.hidden = hitGen === 0;
              var cnt = genEl.querySelector('.sc-gen-h i');
              // 曲数带单位（2026-10-31 主人要求）——这里必须跟 GenBlock.astro 的服务端渲染保持一致：
              // 服务端写的是「N 首」，脚本若只写数字，页面加载完就被覆盖回「20」，单位会消失。
              if (cnt) cnt.textContent = hitGen + ' 首';
              hitSec += hitGen;
            }
            sec.hidden = hitSec === 0;
            // 标题随分区变（2026-10-24 页面组指出）：
            // 原来 h2 是硬编码「全部曲目」，选「原创」时 em 变成 925 首、标题却还写「全部曲目」，
            // 用户看到的是标题与内容不符。现在「全部」→「全部曲目」，具体分区→分区名。
            // 标题按「该 body 是否当前服务器」区分：
            // 当前 srv 跟 state.cat 走；隐藏的 body 一律回到默认「全部曲目」（它再被显示时会重新计算）。
            // 否则切服后 cn 的标题会残留 jp 的「原创」（实测问题 A）。
            var isCurBody = body.getAttribute('data-srv') === state.srv;
            var secH = sec.querySelector('.sc-sec-h h2');
            if (secH) {
              var catForH = isCurBody && state.cat !== 'all' ? state.cat
                : (isCurBody ? '全部曲目' : '全部曲目');
              secH.textContent = catForH;
            }
            var secCnt = sec.querySelector('.sc-sec-h em');
            if (secCnt) secCnt.textContent = hitSec + ' 首';
            if (isMine) totalMine += hitSec;
          }
        }

        // 空态：整页零命中给明确文案 + 一键重置，而不是留白
        // 空态按**当前服务器**判断：jp 搜不到但 cn 能搜到时，jp 视图下仍要显示空态。
        //
        // 【2026-11-12 修「先出无结果再出结果」】
        // 补拉期间骨架块里的卡片还没到，带筛选时骨架按 0 计，于是 totalMine 天然偏小、
        // 常常是 0 —— 空态就会先亮一下「没有找到符合条件的曲目」，等片段回来又被结果顶掉。
        // 这不是「没有」，只是「还没算完」，所以不显示空态；正在打字（typing）同理。
        //
        // 判据取「还有没有骨架块」而不是「lazyState 是否 === 1」：后者只覆盖「正在补拉」，
        // 一旦某段片段失败、懒状态被置成 2 而骨架还留在页面上，就会重新误报（2026-11-12 晚补）。
        // 有骨架 = 数据不完整 = 不下结论；补拉结束后 apply 会再跑一次，那才是最终裁决。
        var pendingLoad = lazyState === 1 || typing || hasSkeletons();
        if (emptyBox) emptyBox.hidden = totalMine > 0 || pendingLoad;
        /* 【2026-11-13 主人「旋转环可能用户看不见，建议在空白处加加载动画」】
           只有「正在加载 + 手上一条结果都没有」才显示：有结果时用户看的是结果，
           再多一只转圈只是噪音；加载完（pendingLoad 变 false）无论有没有命中都收起，
           零命中那一瞬间交给空态，两块不会同时出现。 */
        if (loadingBox) loadingBox.hidden = !(pendingLoad && totalMine === 0);

        // 筛选按钮上的角标：整合进面板后，chips 和排序都看不见了，
        // 必须让按钮自己说明「有几项条件正在生效」，否则用户不知道列表为什么变少了。
        // 只数**筛选类**条件（不含排序）：排序不减少结果，算进去会让角标永远是 1。
        var activeCount = (state.cat !== 'all' ? 1 : 0) + (state.gen !== 'all' ? 1 : 0) +
                          (state.diff !== '' ? 1 : 0) +
                          (state.band !== 'all' ? 1 : 0) + (state.scope !== 'all' ? 1 : 0) +
          (state.type !== 'all' ? 1 : 0);
        if (filterTxt) filterTxt.textContent = activeCount > 0 ? '筛选 · ' + activeCount : '筛选';
        // 用 has-filter 而不是 is-on：is-on 已被「面板展开」占用（见 setPanel），
        // 两个状态共用一个 class 会互相覆盖——展开时把「有筛选」的强调抹掉，收起时又反过来。
        if (panelBtn) panelBtn.classList.toggle('has-filter', activeCount > 0);

        // 命中提示条（2026-10-25 主人要求）：一根横条，写「匹配到 X 首，耗时 Y ms」。
        // 只有真的在筛/排序时才出现。
        var filtering = !!state.q || activeCount > 0 || state.sort !== DEFAULT_SORT_INLINE;
        if (activeBox) {
          activeBox.hidden = !filtering;
          // 只在可见时写数字；隐藏时清空，避免下次展开闪一下上一次的旧值。
          // 数据没齐（pendingLoad）时写「…」而不是那个偏小的数字：补拉期间 totalMine
          // 只数了已经落地的卡片，写出来就是「匹配 0 首」——用户读到的正是「无结果」，
          // 一秒后再变成真数字。宁可先不报数，也别先报错数。
          if (activeTxt) {
            activeTxt.textContent = filtering ? (pendingLoad ? '…' : String(totalMine)) : '';
          }
          if (activeCost) activeCost.hidden = !filtering;
          // 状态点不再换成旋转环（2026-11-13 主人：「空白处有加载动画之后，命中条左侧的
          // 状态点可以不用变成旋转环了」）——加载指示统一交给下面的 .sc-loading 块。
        }

        // aria-pressed 在这里统一收口（2026-10-23 收尾）。
        // 之前只在各事件分支里各自 setAttribute，只要有一条路径忘记同步，
        // 读屏听到的选中态就会和实际筛选状态不符。改成「由 state 反推 UI」：
        // 每次 apply() 都按当前 state 重写一遍，谁调 apply 都不会漏。
        syncPressed();

        applySort();
        stagger();
        refreshIntrinsic();
        // 每次 apply 后落盘：所有用户操作（搜索、chip、下拉、限时曲、切服、重置）
        // 最终都会走到这里，一处写入比在每个事件里各写一遍可靠。
        // 初始化时的 apply() 也会写一次，写的是刚读回来的同一份值，无副作用。
        saveState();

        // 耗时写在最后：它要包含上面全部筛选 + 排序 + 错开入场的标记，
        // 但**不含**浏览器重绘。渲染固定两位小数以下取整，避免出现「耗时 0.30000000000000004ms」。
        if (activeCostTxt && filtering) {
          // 补拉期间同样不报耗时：那一轮的耗时只算了「已落地的卡片」，报出来会显得
          // 筛选特别快、数字又特别少，两条都是假的。改成报还差几段没到。
          if (pendingLoad) {
            var failed = root.querySelectorAll('.sc-gen-ph[data-fail]').length;
            var waiting = root.querySelectorAll('.sc-gen-ph:not([data-fail])').length;
            activeCostTxt.textContent = failed > 0
              ? (waiting > 0 ? waiting + ' 个世代还在加载，' : '') + failed + ' 个世代加载失败（刷新重试）'
              : '正在加载剩余 ' + waiting + ' 个世代';
          } else {
            activeCostTxt.textContent = Math.round(performance.now() - t0) + ' ms';
          }
        }
      }

      // ---- content-visibility 占位高度（2026-10-30 P2）----
      //
      // 【问题】.sc-gen 用 content-visibility:auto 跳过屏外块的渲染，
      // 屏外块的高度只能靠 contain-intrinsic-size 估算。原值写死 460px，
      // 而实测真实高度 1104px（jubeat 20 张）～ 10266px（festo 226 张）。
      // 文档总高因此随滚动一路上涨：刚加载 7889px → 滚到底 37274px。
      // 表现是滚动条变长、拖滚动条跳位、锚点落不准。
      //
      // 【为什么在这里算】列数是 auto-fill 决定的，随容器宽度连续变化
      // （320→360 是 2 列、380 起 3 列、500 起 4 列…… 桌面 780 又回到 4 列），
      // 没有固定断点可言，只能在运行时实测。改动只发生在：
      // ①首帧 ②筛选后（可见卡数变了）③视口宽度变化。
      //
      // 【只写可见块】隐藏的 body（另一台服务器）里的块不写——它们不可见，
      // 写了也只是白算；切服时 apply() 会重跑，那时它们变可见再写。
      // grid 列数从 computedStyle 的 gridTemplateColumns 里数空格+1 得到，
      // 不用 getComputedStyle 之外的手段，避免触发布局计算太多次。
      //
      // 【公式（实测校准到误差 < 0.5px）】
      //   块高 = 行数 × 卡高 + (行数 − 1) × 行间距 + 块头高
      // 注意是 (rows−1) 个行间距，不是 rows 个 —— 最后一行下面没有间距。
      // 我第一版写成了 rows × (卡高 + 间距)，每块都多算一个间距（14px）。
      // 校对数据（1440px 宽，6 列）：
      //   festo 38 行 → 38×255.48 + 37×14 + 40.08 = 10266.32 / 实测 10266
      //   saucer 34 行 → 9188.40 / 实测 9188；jubeat 4 行 → 1104.00 / 实测 1104
      //
      // 【卡高为什么只有一档】2026-10-30 主人把 PICK UP 徽章从「曲绘下的独立一行」
      // 改成「曲绘左上角角标」，徽章脱离文档流，不再撑高卡片 ——
      // 改版前有徽章的卡 279.08px、没有的 255.48px（同页两种卡高，国服视图里还逐块混排）；
      // 改版后全站统一一档。这里因此只要量一张卡就够，不必再按 data-scope 分类。
      // ⚠ 若将来又在卡片里加会撑高的行内元素（新的徽章行、标签行），
      // 这条「一档卡高」的前提就不成立了，必须回到逐行取最大值那套逻辑。
      var intrinsicCols = 0;
      var intrinsicGap = 0;
      var intrinsicCardH = 0;
      // 块头（世代标题行）高度。12 个块实测全是 44px，量一次共用即可 ——
      // 千万别在 refreshIntrinsicNow 里逐块去读（见下面「三修」注释）。
      var intrinsicHead = 40;
      function measureGrid() {
        var sec = root.querySelector('.sc-body:not([hidden]) .sc-sec:not([hidden])');
        var grid = sec && sec.querySelector('.sc-grid');
        if (!grid) return false;
        var cs = getComputedStyle(grid);
        var cols = (cs.gridTemplateColumns || '').split(' ').length;
        if (!cols) return false;
        var card = grid.querySelector('.sc-card');
        if (!card) return false;
        var h = card.getBoundingClientRect().height;
        // 未渲染或样式未定时高度为 0：此时不写，保留 CSS 兜底，等 load/resize 再量
        if (!h) return false;
        intrinsicCols = cols;
        intrinsicGap = parseFloat(cs.rowGap) || 0;
        intrinsicCardH = h;
        // 块头高度就地取当前这一块（它就在视口里、布局已算过，这一读不额外触发重排）
        var head = sec.querySelector('.sc-gen-h');
        if (head) {
          var hh = head.getBoundingClientRect().height;
          if (hh) intrinsicHead = hh;
        }
        return true;
      }
      // ---------------------------------------------------------------------
      // 【2026-10-30 切服卡顿的真凶就是这里，改法见下】
      //
      // 埋点实测（线上 v1.40.0，点服务器卡到点击回调返回的同步耗时）：
      //   总 783ms = 匹配 6ms + syncPressed 2ms + 排序 3ms + 错开入场 47ms + **本函数 725ms**
      // 也就是说 93% 的卡顿出在一个「只是写几个占位高度」的函数上。
      //
      // 为什么这么慢：measureGrid() 里读了 grid 的 computedStyle 与首张卡的
      // getBoundingClientRect —— 这会**强制浏览器把当前 1150 张卡的布局全部算完**。
      // 切服时 DOM 刚被大改（1150 张卡的 hidden 全翻过一遍），这一读就把整份重排
      // 堵在点击回调里，用户看到的就是"点了要等一下才动"。
      //
      // 但它算出来的东西**根本不急着用**：contain-intrinsic-size 只影响
      // "屏外块滚动时的高度估算"，用户此刻正停在顶部看第一屏，晚几帧写完全没感觉。
      //
      // 所以：把「测量 + 写入」整段推迟到两帧之后（rAF × 2）。
      // 写法上用一个小令牌防抖，保证连续切服只算最后一次。
      // ---------------------------------------------------------------------
      // ---------------------------------------------------------------------
      // 【2026-10-30 二修（废）/三修：这个函数一次几何读取都不该做】
      //
      // v1.40.1 把整段推迟到两帧后，点击回调的同步耗时确实降到 45~95ms（实测），
      // 但那 700ms 并没有消失，只是挪到了两帧之后。线上逐帧实测（点服务器卡）：
      //   · 列表切换发生在 ~154ms 那一帧（hidden 是离散改动，立刻重绘）
      //   · 紧接着主线程被冻结 736~1367ms（PerformanceObserver 记到一条 1367ms 长任务）
      //   · 冻结期间服务器卡的高亮过渡（.sc-srv-b 有 0.2s 的 border/background 过渡）
      //     卡在半途不动 —— 主人看到的就是「下面列表已经切了，上面选项卡停顿一会才切过去」
      //
      // 二修先试了「把所有块头高度一次性读完、再统一写」，结果**没用**（本地同源复现实测）：
      //   13 次 getBoundingClientRect 仍然花了 604ms，逐次耗时
      //   0.1 / 0 / 0 / 0 / 61.5 / 132.9 / 37.1 / 32.1 / 66.2 / 42.7 / 86.7 / 24.9 / 120.2 ms
      //   —— 读第一张卡那次是 0.1ms，之后每读一个 .sc-gen-h 就要几十上百毫秒。
      // 原因不在「写读交替」，而在块本身：.sc-gen 带 content-visibility: auto，
      // 屏外的块是被 skip 的；读它的后代几何 = 让这个块「变相关」，浏览器就得把
      // 这个块里的上百张卡重新排一遍。读 12 个块头 = 重排 12 次。
      //
      // 所以三修：块头高度只在 measureGrid() 里量**当前视口内那一块**的（同一份布局，实测 0.1ms 级），
      // 12 个块共用同一个值（实测 12 个块头全是 44px）；refreshIntrinsicNow 里只写不读。
      // ---------------------------------------------------------------------
      var intrinsicToken = 0;
      function refreshIntrinsicNow() {
        if (!measureGrid()) return;
        var secs = root.querySelectorAll('.sc-body:not([hidden]) .sc-sec:not([hidden])');
        // 只写不读：写 style 不会让布局失效，重排交给浏览器在下一帧自己批处理。
        for (var s = 0; s < secs.length; s++) {
          var gens = secs[s].querySelectorAll('.sc-gen');
          for (var g = 0; g < gens.length; g++) {
            var el = gens[g];
            /* 【骨架块一律不跳过（2026-11-15 复查补修）】
               CSS 那条「前两块豁免」只认位置，而骨架根本不在位置上：实测首块骨架排在第 5 块，
               前几块全是已经落地的真卡。骨架被跳过时只能按 data-count 的估值站着、不参与
               真布局，补齐那一刻整块回填——顶部那根正好跳在首屏里。
               成本很低，可以整类放开：一根骨架就 8 张占位卡，1200 多张的真卡在后面的真块里，
               跳过它们的收益一点没少。骨架被 loadFrag 换成真卡后不再带 sc-gen-ph，
               行内值随即清空、交回 CSS 按 DOM 位置判断。 */
            var isPh = el.className.indexOf('sc-gen-ph') !== -1;
            el.style.contentVisibility = isPh ? 'visible' : '';
            /* 骨架块（2026-11-02）：按 data-count 算高度，高度 = 真块高度。
               这是「骨架不跳」的关键：否则滚到它时页面会长高一截（CLS）。
               骨架网格本身也撑到同样高度，让 8 张占位卡靠上排、下方留白由网格撑住。 */
            if (isPh) {
              var phN = Number(el.getAttribute('data-count') || 0);
              var phRows = Math.ceil(phN / intrinsicCols);
              el.style.containIntrinsicSize =
                'auto ' + (phRows * intrinsicCardH + (phRows - 1) * intrinsicGap + intrinsicHead).toFixed(2) + 'px';
              var phGrid = el.querySelector('.sc-grid-ph');
              if (phGrid) {
                phGrid.style.height =
                  (phRows * intrinsicCardH + (phRows - 1) * intrinsicGap).toFixed(2) + 'px';
              }
              continue;
            }
            // 占位高度按**可见**卡数算：筛选后块内卡少了，占位不能还按原始总数虚高。
            var vis = el.querySelectorAll('.sc-card:not([hidden])').length;
            if (el.hidden || vis === 0) { el.style.containIntrinsicSize = ''; continue; }
            var rows = Math.ceil(vis / intrinsicCols);
            var total = rows * intrinsicCardH + (rows - 1) * intrinsicGap + intrinsicHead;
            el.style.containIntrinsicSize = 'auto ' + total.toFixed(2) + 'px';
          }
        }
      }
      /** 推迟到两帧后再算：第一帧让 apply 的 DOM 改动先交给浏览器排版，第二帧才量。 */
      function refreshIntrinsic() {
        var my = ++intrinsicToken;
        /* 【首帧也要点亮骨架（2026-11-15 复查补修）】
           光把 content-visibility 写进行内样式不够：这条属性由 style 决定生效与否，
           而记着的骨架块在被跳过时**不会参与布局**，写上去的这一行要对它重排才落地。
           排在两个 rAF 之后就是「首帧之后」，第一帧看不到骨架，列表头那一块是空白。
           所以另起一条同步旁路：只挑还没换掉的骨架块、只在这一帧里写，不读任何几何，
           代价是几毫秒；真正的尺寸计算照旧留在 refreshIntrinsicNow 里。
           筛选/排序要重排骨架时也走这里，同样没有额外代价（骨架本来就要重排）。 */
        var live = root.querySelectorAll('.sc-gen-ph:not([style*="content-visibility"])');
        for (var i = 0; i < live.length; i++) {
          live[i].style.contentVisibility = 'visible';
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (my !== intrinsicToken) return;   // 期间又切了一次，这次作废
            refreshIntrinsicNow();
          });
        });
      }
      // 视口宽度变化要重算（列数与卡高都变）。debounce 120ms：
      // 拖窗口边缘时 resize 会连发几十次，每次都遍历 12 个块没必要。
      var intrinsicTimer = 0;
      window.addEventListener('resize', function () {
        clearTimeout(intrinsicTimer);
        intrinsicTimer = setTimeout(refreshIntrinsic, 120);
      });
      // 【首帧补测一次】apply() 在解析末尾同步跑，那一刻字体可能还没定下来
      // （字体不同 → 曲名折行不同 → 卡高不同）。load 之后再量一次，用最终布局校准。
      // 若首次已量准，这次只是写入同样的值，没有副作用。
      window.addEventListener('load', function () {
        clearTimeout(intrinsicTimer);
        intrinsicTimer = setTimeout(refreshIntrinsic, 60);
      });

      // 把 state → aria-pressed / .is-on 的映射集中在一处
      function syncPressed() {
        // state.diff 为 '' （未选）时，syncGroup 里「attr === ''」没有一个 chip 命中，
        // 于是所有档都取消选中 —— 正是「默认不选」想要的表现，不需要额外分支。
        syncGroup('[data-diff]', 'data-diff', state.diff);
        syncGroup('[data-band]', 'data-band', state.band);
        syncGroup('.sc-cat-set[data-srv="' + state.srv + '"] .sc-chip', 'data-cat', state.cat);
        // 范围 chip 只同步当前服务器那一套：隐藏那套的选中态由它自己被显示时重新算
        // （两服 PICK UP 集合不同，把 jp 的「pick」选中态抄到 cn 上会显示错误计数）
        syncGroup('.sc-scope-set[data-srv="' + state.srv + '"] .sc-chip', 'data-scope', state.scope);
        syncGroup('[data-view]', 'data-view', state.view);
      }

      // 排列切换的淡出计时器，与「系统开了降动效」的判据（见 setView）
      var viewTimer = 0;
      function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      /** 排列方式：写 root 的 data-view（CSS 只认这个属性）+ 同步按钮 + 落盘。
       *  不走 apply() —— view 不改变哪些卡命中，走 apply 会让 1683 张卡白翻一遍 hidden、
       *  还会把搜索框的命中耗时算进来；这里只重算占位高度（卡高变了，骨架高度必须跟着变）。 */
      function setView(v) {
        if (v !== 'grid' && v !== 'list') v = 'grid';
        if (state.view === v) return;
        state.view = v;
        var el = document.documentElement;
        // 过渡（2026-11-14 主人要求）：先给 <html> 挂 data-view-sw 让当前列表淡出（0.16s），
        // 到一半再真正换布局，换完撤掉标记淡回。淡出期间列表还在原位，看不见重排的跳变。
        // 只动 opacity/transform，不动会引发布局的属性；动画挂在 section 上，
        // 1683 张卡不会各跑一遍。
        el.setAttribute('data-view-sw', '');
        clearTimeout(viewTimer);
        var apply2 = function () {
          // 写在 <html> 而不是 root：列表排列的样式全部挂 html[data-view="list"]，
          // 头部预热脚本也认这个属性，刷新时才能首帧就是列表。
          el.setAttribute('data-view', v);
          // 按钮态跟着换：它不能在淡出期间就亮起来（那样看起来像「已经切好、只是列表没动」）
          syncGroup('[data-view]', 'data-view', v);
          // 落盘：刷新后要保持这次的排列（与其它筛选同一个存档键，首帧预热脚本也读它）
          saveState();
          // 换完布局要让占位高度按新卡高重算（骨架块高度必须跟着变，否则滚到时会跳）
          refreshIntrinsic();
          // 下一帧撤标记：与「移除后再加」同理，同一帧内改两次浏览器看不到变化。
          // 这里同样不用 requestAnimationFrame —— 本机浏览器的 rAF 会整段不回调（见 viewIn）。
          setTimeout(function () {
            setTimeout(function () {
              el.removeAttribute('data-view-sw');
              // 撤掉整段淡出之后，再让可见的头十几张浮出（见 viewIn）
              if (!prefersReducedMotion()) viewIn();
            }, 16);
          }, 16);
        };
        if (prefersReducedMotion()) apply2();
        else viewTimer = setTimeout(apply2, 80);
      }

      /** 排列切换后的浮出：只给切换后可见的头十几张挂 .sc-vin（同 stagger 的取舍，
       *  1683 张各跑一遍撑不住）。换布局不重排节点、元素不变，"删类名 + 下一帧再加"
       *  那套重播机制在这里用不上，所以每次换了卡片集合后整批先删、再逐个加。 */
      var vinToken = 0;
      function viewIn() {
        var my = ++vinToken;
        // 容器每次现取：本脚本在 <head> 之后、结构落位之前就跑了，闭包里的 root 不保证还在
        var box = document.getElementById('songsRoot');
        if (!box) return;
        var old = box.querySelectorAll('.sc-card.sc-vin');
        for (var i = 0; i < old.length; i++) {
          old[i].classList.remove('sc-vin');
          old[i].style.animationDelay = '';
        }
        // 用 setTimeout 而不是 requestAnimationFrame：实测本机浏览器里页面的 rAF 会被
        // 节流到几乎不回调（400ms 内 0 次，同页 setInterval 20ms 却正常 20 次），
        // 挂在 rAF 上的挂类逻辑就一直等不到。16ms 与一帧等效。
        setTimeout(function () {
          if (my !== vinToken) return;
          var vis = box.querySelectorAll('.sc-body:not([hidden]) .sc-sec:not([hidden]) .sc-card:not([hidden])');
          for (var c = 0; c < vis.length && c < 14; c++) {
            vis[c].classList.add('sc-vin');
            vis[c].style.animationDelay = (c * 0.022).toFixed(3) + 's';
          }
        });
      }

      // 调试出口：控制台里敲 __viewIn() 可手动复播一次浮出，不用来回点切换器
      try { window.__viewIn = viewIn; } catch (e) {}

      function syncGroup(sel, attr, want) {
        var list = root.querySelectorAll(sel);
        for (var i = 0; i < list.length; i++) {
          var hit = list[i].getAttribute(attr) === want;
          list[i].classList.toggle('is-on', hit);
          list[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
        }
      }

      // 错开入场：只给当前可见的前 12 张（1248 张全做动画没有意义，也撑不住）
      //
      // 【2026-11-13 去掉强制回流（主人「点 X 清除搜索要卡一下」）】
      // 旧写法在同一帧先删 sc-stag、再 `void root.offsetWidth` 逼浏览器重排一次、再重新加上，
      // 靠「这一读」让动画从头播。问题是 apply 之前刚把上千张卡的 hidden 翻过一遍，
      // 这一读就把**整份列表的重排**钉死在点击回调里 —— 线上实测这一读约 250ms，
      // 连同后面 applySort 写的 1683 个 order，点击到画面响应一共 300~800ms。
      // 现在改成「这一帧只删、下一帧再加」：删与加天然落在两次样式计算之间，动画照样重播，
      // 回调里一次几何读取都没有。代价只是入场动画晚 1 帧（16ms），看不出来。
      var staggerToken = 0;
      function stagger() {
        var my = ++staggerToken;
        var old = root.querySelectorAll('.sc-card.sc-stag');
        for (var i = 0; i < old.length; i++) {
          old[i].classList.remove('sc-stag');
          old[i].style.animationDelay = '';
        }
        requestAnimationFrame(function () {
          // 期间又调了一次 apply（连打搜索、切服），这帧作废，交给最后一次
          if (my !== staggerToken) return;
          var vis = root.querySelectorAll('.sc-body:not([hidden]) .sc-sec:not([hidden]) .sc-card:not([hidden])');
          for (var c = 0; c < vis.length && c < 12; c++) {
            vis[c].classList.add('sc-stag');
            vis[c].style.animationDelay = (c * 0.03).toFixed(2) + 's';
          }
        });
      }

      // ---- 搜索：输入即筛，debounce 160ms（1248 张卡每个按键全量遍历会卡） ----
      //
      // 【2026-11-12】120ms 对快打还是偏灵：一次连打会连着提交好几次中间态
      // （"x" → "xe" → "xen"），每次都隐藏一遍不匹配的卡、空态也可能跟着跳。
      // 收到 160ms 后一次连打基本只提交最终值；typing 标记让提交前的这段时间
      // 不参与「零命中」的判断（见 apply 里的 pendingLoad）。
      var timer = null;
      var typing = false;
      function commitSearch() {
        typing = false;
        state.q = (search && search.value || '').trim().toLowerCase();
        if (clearBtn) clearBtn.hidden = !(search && search.value);
        apply();
      }
      function onSearch() {
        typing = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(commitSearch, 160);
      }
      function clearSearch() {
        if (!search) return;
        if (timer) clearTimeout(timer);
        typing = false;
        search.value = '';
        state.q = '';
        if (clearBtn) clearBtn.hidden = true;
        apply();
        search.focus();
      }
      if (search) {
        search.addEventListener('input', onSearch);
        search.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); if (timer) clearTimeout(timer); commitSearch(); }
          else if (e.key === 'Escape') { e.preventDefault(); clearSearch(); }
        });
      }
      if (clearBtn) clearBtn.addEventListener('click', clearSearch);

      // ---- 折叠面板：展开/收起带动画（2026-10-25 主人要求）----
      //
      // 【为什么不能再用 hidden 做开合】
      // hidden 等价于 display:none，而 display 不参与过渡——加/删 hidden 是瞬间跳变，
      // 想做出"展开"必须同时动一个可过渡的属性。这里用 grid-template-rows 0fr↔1fr
      // 撑高度（子项 overflow:hidden），配合 opacity 与位移，做出"抽出来"的感觉。
      //
      // 【hidden 何时加】收起动画要跑完才能 hidden，否则元素立刻消失、过渡根本看不到。
      // 所以收起时先标 data-open='false' 让 CSS 开始过渡，等 transitionend（或兜底 260ms）
      // 再真正 hidden。展开则相反：先去掉 hidden 触发一次重排，下一帧再改 data-open，
      // 浏览器才会把 0fr → 1fr 当成过渡而不是"初始值直接渲染"。
      //
      // 【重复点击】快速连点时两个方向的定时器会打架，所以用 panelTimer 统一掐断，
      // 并且以 state 里的 open 标志为准，不读 DOM（DOM 可能还在动画中途）。
      var panelTimer = 0;
      var panelOpen = false;
      function setPanel(open, immediate) {
        if (!panel || !panelBtn) return;
        panelOpen = open;
        clearTimeout(panelTimer);

        panelBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        panelBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
        panelBtn.classList.toggle('is-on', open);
        // 收起后（尤其是动画途中）面板内容不该被 Tab 聚焦到：inert 比 visibility 更彻底。
        if (open) panel.removeAttribute('inert');
        else panel.setAttribute('inert', '');

        if (immediate) {
          panel.hidden = !open;
          panel.setAttribute('data-open', open ? 'true' : 'false');
          return;
        }

        if (open) {
          // 展开：脱 hidden → height:0（锁起点）→ 量内容真实高度 → 写该高度。
          // 【关键】量高度必须在内层已经排好版之后：先 hidden=false 再量，
          // display:none 期间 scrollHeight 恒为 0（这是本轮踩过的坑）。
          panel.hidden = false;
          panel.style.height = '0px';
          void panel.offsetHeight;              // 锁住"0 高度"这一帧
          var realH = panel.scrollHeight;       // 内容全高（含内边距）
          panel.style.height = realH + 'px';
          panel.setAttribute('data-open', 'true');
          // 动画结束后清掉固定高度，改由内容撑开：不然后续切服/窄屏折行
          // 让内容变高时，面板会停在旧高度、把底部控件裁掉。
          clearTimeout(panelTimer);
          panelTimer = setTimeout(function () {
            if (!panelOpen) return;
            panel.style.height = 'auto';
          }, 300);
        } else {
          // 收起：先把当前高度固化成像素（auto 无法过渡到 0），再设 0。
          panel.style.height = panel.offsetHeight + 'px';
          void panel.offsetHeight;
          panel.style.height = '0px';
          panel.setAttribute('data-open', 'false');
          panelTimer = setTimeout(function () {
            if (panelOpen) return; // 期间又展开了
            panel.hidden = true;
          }, 280);
        }
      }
      if (panelBtn) panelBtn.addEventListener('click', function () {
        setPanel(!panelOpen);
      });
      // Esc 收起面板（焦点在搜索框时不抢：那边 Esc 是清空）
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (document.activeElement === search) return;
        if (panelOpen) { setPanel(false); if (panelBtn) panelBtn.focus(); }
      });

      // ---- 自定义下拉（2026-10-25）----
      // 原生 select 留在 DOM 当数据源；用户点的是 .sc-dd-list 里的 li。
      // 点中后：写 select.value → 派发 change → 复用它下面那套筛选逻辑（一行没改）。
      // 这样做的好处是可访问性不倒退：读屏仍能识别 select 的 label，
      // 键盘也能用（Tab 到按钮、Enter/Space 展开、方向键移动、Esc 关闭、Enter 选中）。
      var dds = [];
      function ddClose(dd) {
        dd.setAttribute('data-open', 'false');
        dd.querySelector('.sc-dd-b').setAttribute('aria-expanded', 'false');
        var list = dd.querySelector('.sc-dd-list');
        list.hidden = true;
        // 展开时会按"按钮上方剩余空间"写内联 max-height；关闭时清掉，
        // 否则下次换个位置展开前会先残留上一次的旧上限（闪一下短列表）。
        list.style.maxHeight = '';
      }
      function ddLabelOf(dd) {
        var sel = dd.querySelector('select');
        var opt = sel.options[sel.selectedIndex];
        return opt ? opt.textContent : '';
      }
      // 把三个原生 select 的当前值刷新到自定义按钮上。
      // resetAll 与程序化改值都必须调它，否则按钮文字会停在旧值
      // （select.value 变了、可见的 .sc-dd-v 没变，用户会以为没重置）。
      function ddRefresh() {
        for (var i = 0; i < dds.length; i++) ddSync(dds[i]);
      }

      function ddSync(dd) {
        dd.querySelector('.sc-dd-v').textContent = ddLabelOf(dd);
        var cur = dd.querySelector('select').value;
        var items = dd.querySelectorAll('.sc-dd-list li');
        for (var i = 0; i < items.length; i++) {
          items[i].setAttribute('aria-selected', items[i].getAttribute('data-v') === cur ? 'true' : 'false');
        }
      }
      function ddOpen(dd) {
        // 同时只允许一个展开：否则两个弹层会叠在一起
        for (var i = 0; i < dds.length; i++) if (dds[i] !== dd) ddClose(dds[i]);
        dd.setAttribute('data-open', 'true');
        dd.querySelector('.sc-dd-b').setAttribute('aria-expanded', 'true');
        var list = dd.querySelector('.sc-dd-list');
        list.hidden = false;
        // 【弹层方向：固定向上，不再做"上/下"二选一】
        // 历史：10-28 先修了"面板末行时列表跑出视口"（当时翻向上）；
        // 10-29 又发现方向会随滚动乱翻（判据误用 scrollHeight），改成按实际显示高度判。
        // 主人 2026-10-29 04:40 拍板：**无论在哪都向上展开**——向下会被下方的
        // 曲目卡片/世代分区挡住（它们在同一 stacking 上下文里排在后面），
        // 而向上永远只是盖住筛选面板自己的上几行，不会压在内容上。
        //
        // 所以这里只做一件事：量按钮上方还剩多少空间，把列表可用高度收缩到那个范围内。
        // 列表本身 max-height:268px，上方空间更小时改用内联 max-height，
        // 内容超出的部分由 overflow-y:auto 内部滚动（世代下拉 13 项在窄屏也放不下）。
        var btnRect = dd.querySelector('.sc-dd-b').getBoundingClientRect();
        var GAP = 12; // 4px 间距 + 8px 呼吸位
        var spaceAbove = btnRect.top - GAP;
        list.setAttribute('data-drop', 'up');
        // 可用高度 = 按钮上方到视口顶边（含 GAP 呼吸位），上限 268 与 CSS 的 max-height 一致。
        //
        // 【贴顶的边界 case】按钮被滚到紧贴视口顶边时 spaceAbove 可能只有几像素甚至为负，
        // 直接照抄会让列表顶部被视口裁掉（实测 ratio=0 时 list top = -5px）。
        // 这里不翻向下（主人要求固定向上），而是**先把页面往上留出空间**：
        // 需要多少就 window.scrollBy(0, -缺口)，按钮随之下移，列表自然落回视口内。
        // 少滚动的情况（绝大多数位置缺口为 0）完全不触发，不会造成"点一下页面就跳"。
        var rectH = list.getBoundingClientRect().height || 0;
        if (!rectH) {
          var mh = parseInt(getComputedStyle(list).maxHeight, 10);
          rectH = Number.isFinite(mh) ? mh : 268;
        }
        var need = Math.min(rectH, 268);
        var deficit = need - Math.max(0, spaceAbove);
        if (deficit > 0) window.scrollBy(0, -deficit);
        // 滚动后重新量一次按钮位置，再决定内联高度（必须基于滚动后的坐标）
        var after = dd.querySelector('.sc-dd-b').getBoundingClientRect();
        var avail = Math.max(0, Math.min(after.top - GAP, 268));
        list.style.maxHeight = Math.max(96, avail) + 'px';
        // 让当前选中项滚进视野（世代 13 项，不滚的话要自己找）
        var cur = dd.querySelector('.sc-dd-list li[aria-selected="true"]');
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
      }
      function ddPick(dd, v) {
        var sel = dd.querySelector('select');
        if (sel.value !== v) {
          sel.value = v;
          // 直接派发 change：复用既有的筛选监听，避免两套状态
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          ddSync(dd);
        }
        ddClose(dd);
        dd.querySelector('.sc-dd-b').focus();
      }
      root.querySelectorAll('.sc-dd').forEach(function (dd) {
        dds.push(dd);
        var btn = dd.querySelector('.sc-dd-b');
        var list = dd.querySelector('.sc-dd-list');
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (dd.getAttribute('data-open') === 'true') ddClose(dd); else ddOpen(dd);
        });
        list.addEventListener('click', function (e) {
          var li = e.target.closest('li[data-v]');
          if (!li) return;
          e.stopPropagation();
          ddPick(dd, li.getAttribute('data-v'));
        });
        // 键盘：按钮上 Enter/Space 已由原生触发 click；这里补方向键与 Esc
        btn.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            ddOpen(dd);
            var items = [...list.querySelectorAll('li')];
            var idx = items.findIndex(function (x) { return x.getAttribute('aria-selected') === 'true'; });
            var next = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
            if (next) { next.classList.add('is-focus'); next.scrollIntoView({ block: 'nearest' }); }
          }
        });
        list.addEventListener('keydown', function (e) {});
        ddSync(dd);
      });
      // 点外面关掉；Esc 也关掉（注意别和「Esc 收起面板」抢：这里先处理并阻止冒泡）
      document.addEventListener('click', function () {
        for (var i = 0; i < dds.length; i++) if (dds[i].getAttribute('data-open') === 'true') ddClose(dds[i]);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        for (var i = 0; i < dds.length; i++) {
          if (dds[i].getAttribute('data-open') === 'true') { ddClose(dds[i]); e.stopPropagation(); return; }
        }
      }, true);

      // ---- 下拉筛选 ----
      root.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.id) return;
        if (t.id === 'scGen') { state.gen = t.value; ddRefresh(); apply(); }
        else if (t.id === 'scSort') { state.sort = t.value; ddRefresh(); apply(); }
        else if (t.id === 'scType') { state.type = t.value; ddRefresh(); apply(); }
      });

      // ---- chip / 按钮：服务器、分区、难度档、区间、重置 ----
      function setChipGroup(sel, active) {
        var list = root.querySelectorAll(sel);
        for (var i = 0; i < list.length; i++) {
          var hit = list[i] === active;
          list[i].classList.toggle('is-on', hit);
          list[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
        }
      }

      function resetAll() {
        state.q = ''; state.gen = 'all';
        state.diff = ''; state.band = 'all'; state.sort = DEFAULT_SORT_INLINE;
        state.cat = 'all'; state.scope = 'all'; state.showLimited = false; state.type = 'all';
        if (search) search.value = '';
        if (clearBtn) clearBtn.hidden = true;
        var limBox = document.getElementById('scLimited');
        if (limBox) limBox.checked = false;
        if (sortSel) sortSel.value = DEFAULT_SORT_INLINE;
        var gi = document.getElementById('scGen'); if (gi) gi.value = 'all';
        var ti = document.getElementById('scType'); if (ti) ti.value = 'all';
        ddRefresh(); // select.value 改了，可见的下拉按钮文字也要跟着回「全部…」
        // 难度档没有「全部」chip 了：重置 = 让所有 chip 都取消选中
        var dChips = root.querySelectorAll('[data-diff]');
        for (var dc = 0; dc < dChips.length; dc++) {
          dChips[dc].classList.remove('is-on');
          dChips[dc].setAttribute('aria-pressed', 'false');
        }
        setChipGroup('[data-band]', root.querySelector('[data-band="all"]'));
        var set = root.querySelector('.sc-cat-set[data-srv="' + state.srv + '"]');
        if (set) setChipGroup('.sc-cat-set[data-srv="' + state.srv + '"] .sc-chip', set.querySelector('.sc-chip[data-cat="all"]'));
        var scSet = root.querySelector('.sc-scope-set[data-srv="' + state.srv + '"]');
        if (scSet) setChipGroup('.sc-scope-set[data-srv="' + state.srv + '"] .sc-chip', scSet.querySelector('.sc-chip[data-scope="all"]'));
        // 【2026-10-30】重置是用户的明确意图，要把存档一起清掉。
        // ⚠ 实测踩到：只 removeItem 不够——紧接着的 apply() 里又会 saveState()，
        // 把「全默认」原样写回去，存档等于没清（测出来的 localStorage 仍有完整 JSON）。
        // 故用 suppressSave 在这一次 apply 期间禁用写入，跑完再恢复。
        suppressSave = true;
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        apply();
        suppressSave = false;   // 只在这一次 apply 期间禁写，之后恢复正常存档
      }

      // 【2026-10-28 显示限时曲】独立开关：change 即生效（不用点应用）。
      // 它是全局维度，切服务器时不清零——两服的限时曲口径一致。
      (function () {
        var box = document.getElementById('scLimited');
        if (!box) return;
        box.addEventListener('change', function () {
          state.showLimited = !!box.checked;
          apply();
        });
      })();

      // ---- 点世代名跳到下一世代（2026-10-30 主人要求）----
      //
      // 行为：点当前世代的标题 → 滚到「下一个有内容的世代块」；已经在最后一个就回到第一个（循环）。
      // 为什么不跳「下一个同名 DOM 节点」而要先过滤可见性：
      //   筛选后很多世代块会被 hidden 掉（块内一张卡都不命中），
      //   直接取 nextElementSibling 会滚到一个 display:none 的块，页面毫无反应，像坏了。
      // 为什么用 scrollIntoView 而不是改 scrollTop：
      //   世代块高度随列数变化（桌面 6 列 / 窄屏 3 列），写死偏移必然错；
      //   块头是 sticky（top:0），scrollIntoView({block:'start'}) 正好把它顶到吸顶位置。
      //   再减掉 .sc-gen-h 的高度会让它被吸顶条盖住一半，所以不减。
      //
      // 【2026-11-02 晚修「跳到没加载的世代会弹回 jubeat」】
      // 骨架块（.sc-gen-ph）里没有 .sc-card，原先的过滤条件把它整块排除掉，
      // 于是点「copious」时下一个命中项被算成 jubeat（第一个真块），
      // 页面从当前位置平滑滚回顶部——看起来就是「弹回第一个世代」。
      // 现在把骨架块也算进候选：它是真实存在的世代，滚过去会触达 IntersectionObserver
      // 自动换成真卡片，正好等于「跳过去并加载」。只有 hidden 的块（筛选后空块）才跳过。
      function genJump(fromEl) {
        var sec = fromEl.closest('.sc-sec');
        if (!sec) return;
        var all = [];
        var list = sec.querySelectorAll('.sc-gen');
        for (var i = 0; i < list.length; i++) {
          if (list[i].hidden) continue;                       // 筛掉的空块不跳
          if (!list[i].querySelector('.sc-card:not([hidden])') && list[i].className.indexOf('sc-gen-ph') === -1) continue;
          all.push(list[i]);
        }
        if (all.length < 2) return;                 // 只剩一个世代，没什么可跳的
        var idx = all.indexOf(fromEl);
        var next = all[(idx + 1) % all.length];     // 到末尾回到第一个
        // 跳转前把焦点也移过去，读屏才不会停在原处（按钮本身没有 tabindex 也能 focus）
        var btn = next.querySelector('[data-gen-jump]');
        next.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (btn) btn.focus({ preventScroll: true });
      }

      root.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        var genBtn = t.closest('[data-gen-jump]');
        if (genBtn) { genJump(genBtn.closest('.sc-gen')); return; }

        if (t.closest('#scReset') || t.closest('[data-sc-reset]')) { resetAll(); return; }

        // 排列方式（2026-11-14）：只切 root 上的 data-view，不重排 DOM、不进 state 的筛选维度，
        // 所以不触发 apply 里那套隐藏/排序，走一条更轻的路（setView 只写属性 + 高亮 + 存档）。
        // 只认按钮类名：data-view 也挂在 <html> 上，用 [data-view] 时任何点击都会
        // closest 到 <html> 被当成「点了切换器」，后面的切服/分区全被挡掉（2026-11-14 bug）。
        var viewB = t.closest('.sc-view-b');
        if (viewB) { setView(viewB.getAttribute('data-view')); return; }

        var srvB = t.closest('.sc-srv-b');
        if (srvB) {
          var nextSrv = srvB.getAttribute('data-srv');
          // 换服务器必须把「服务器专属」的两个维度一起归零：分区与世代。
          // 只重置分区是不够的——实测踩过：日服筛到 festo 再切国服，世代筛选还挂着
          // festo，而国服只有音乐魔方一个世代，于是整页 0 命中、只剩空态，看着像坏了。
          // 搜索 / 难度档 / 定数区间 是全局维度，跨服仍然有意义，保留。
          // （曲师下拉已按主人要求删除，曲师仍可用搜索框打名字找到。）
          if (nextSrv !== state.srv) {
            // 范围也要归零：两服的 PICK UP 集合毫无重叠（日服=bta 世代，国服=音乐魔方+Ave.+解禁II），
            // 保留「pick」切过去会得到另一批曲甚至 0 命中，看着像坏了。
            state.cat = 'all';
            state.gen = 'all';
            state.scope = 'all';
            // 世代是**服务器专属**维度，归零之后连可见的自定义下拉也一起回「全部世代」。
            // 2026-11-04 主人实测撞出：只写 select.value 不调 ddRefresh，可见按钮文字与
            // 弹层的 aria-selected 全停在旧世代，列表却已经是全部世代——筛选项显示 A、
            // 结果却是 B，看着像数据串了。（归零本身是对的：日服筛着 festo 切国服会 0 命中。）
            var genSel = document.getElementById('scGen');
            if (genSel) genSel.value = 'all';
            ddRefresh();
            var chipsAll = root.querySelectorAll('.sc-cat-set .sc-chip');
            for (var i = 0; i < chipsAll.length; i++) {
              var isAll = chipsAll[i].getAttribute('data-cat') === 'all';
              chipsAll[i].classList.toggle('is-on', isAll);
              chipsAll[i].setAttribute('aria-pressed', isAll ? 'true' : 'false');
            }
            // scope 的选中态不用在这里手写：下面 state.srv 赋值后调 apply()，
            // syncPressed() 会按新服务器那一套重新同步（手写一遍反而可能与它打架）。
          }
          state.srv = nextSrv;
          apply(); return;
        }

        var dChip = t.closest('[data-diff]');
        if (dChip) {
          // 【2026-10-30 删掉「全部档」后必须补这个：点已选中的档 = 取消选择】
          // 原来「回到不筛」是靠点「全部档」这个 chip 实现的；chip 没了，
          // 若不补这个开关，用户选了 EXT 就再也回不到"不按难度筛"的状态
          // （只能点面板底部的重置全部，那会把其他条件一起清掉，太重）。
          var clicked = dChip.getAttribute('data-diff');
          if (state.diff === clicked) {
            state.diff = '';
            var chips = root.querySelectorAll('[data-diff]');
            for (var ci = 0; ci < chips.length; ci++) {
              chips[ci].classList.remove('is-on');
              chips[ci].setAttribute('aria-pressed', 'false');
            }
          } else {
            state.diff = clicked;
            setChipGroup('[data-diff]', dChip);
          }
          apply(); return;
        }

        var bChip = t.closest('[data-band]');
        if (bChip) {
          state.band = bChip.getAttribute('data-band');
          setChipGroup('[data-band]', bChip);
          apply(); return;
        }

        // 范围 chip（PICK UP / COMMON）：与分区 chip 一样「只认自己服务器那一套」
        var sChip = t.closest('[data-scope]');
        if (sChip) {
          var sSet = sChip.closest('.sc-scope-set');
          if (!sSet || sSet.getAttribute('data-srv') !== state.srv) return;
          state.scope = sChip.getAttribute('data-scope');
          setChipGroup('.sc-scope-set[data-srv="' + state.srv + '"] .sc-chip', sChip);
          apply(); return;
        }

        var chip = t.closest('.sc-chip');
        if (chip) {
          var set = chip.closest('.sc-cat-set');
          if (!set || set.getAttribute('data-srv') !== state.srv) return;
          state.cat = chip.getAttribute('data-cat');
          setChipGroup('.sc-cat-set[data-srv="' + state.srv + '"] .sc-chip', chip);
          apply();
        }
      });

      // ---- 分段加载（2026-11-02，B 方案）----
      // 骨架块 → 滚到附近 → 取该世代的 SSR 片段（/songs/frag）→ 替换骨架。
      // 为什么是「SSR 片段」而不是客户端用 JSON 现画：卡片结构（徽章/难度条/PICK UP）
      // 全在 SongCard.astro 里，客户端重画等于再写一份，两份必然漂。
      var lazyState = 0; // 0=正常 / 1=正在全部补拉 / 2=已补拉完（不再尝试）
      function hasSkeletons() { return !!root.querySelector('.sc-gen-ph'); }
      function hasFilters() {
        return !!(state.q || state.cat !== 'all' || state.gen !== 'all' || state.diff ||
          state.band !== 'all' || state.scope !== 'all' || state.type !== 'all');
      }
      /** 把一个骨架块换成真实世代块。失败时保留骨架（比留一片空白好）。 */
      function loadFrag(ph) {
        var srv = ph.getAttribute('data-srv') || 'jp';
        var gen = ph.getAttribute('data-gen') || '';
        var url = '/songs/frag?srv=' + encodeURIComponent(srv) + '&gen=' + encodeURIComponent(gen);
        /* 【2026-11-12】取片段文本，失败重试一次：失败的那段骨架会一直留在页面上，
           而懒状态已经走到 2，「有没有算完」和「有没有数据」就不再一致。
           300ms 后重试一次足够挡住抖动（边缘 429 / 连接被掐）；重试失败才交给调用方吞掉。 */
        function getText(tries) {
          return fetch(url, { credentials: 'same-origin' })
            .then(function (r) {
              if (!r.ok) throw new Error('frag ' + r.status);
              return r.text();
            })
            .catch(function (err) {
              if (tries > 0 && ph.parentNode) {
                return new Promise(function (res) { setTimeout(res, 300); })
                  .then(function () { return getText(tries - 1); });
              }
              throw err;
            });
        }
        return getText(1)
          .then(function (html) {
            var tmp = document.createElement('div');
            tmp.innerHTML = html.trim();
            /* 【2026-11-12】不能用 firstElementChild：本地 astro dev 下 Vite 会给每个 HTML
               响应最前面注入一段它自己的客户端脚本标签，于是第一个元素是脚本而不是
               .sc-gen —— 骨架被换成一段脚本，整块世代凭空消失（dev 里只剩首屏那 311 张卡，
               线上正常）。按类名取，别依赖位置。 */
            var node = tmp.querySelector('.sc-gen') || tmp.firstElementChild;
            if (!node) throw new Error('frag empty');
            /* 【2026-11-03 修「打字一快就把没筛选的结果也带上来」】
               片段落地时页面可能已经有搜索词了，但它此刻是「全量、未筛选」的。
               调用方在 loadFrag 之后才 apply，而这里先写进 DOM，下一帧就会画出来 ——
               实测快速连打时，saucer/prop/Qubell 等块会带着 201 首、121 首整块闪一下，
               屏幕上全是 bass 搜不到的曲。所以先就地按当前条件筛一遍再插入，
               逐张卡调同一个 matchCard，判据不另写一份。 */
            if (hasFilters()) {
              var srvOfNode = node.getAttribute('data-srv') || 'jp';
              var incoming = node.querySelectorAll('.sc-card');
              var kept = 0;
              for (var ci = 0; ci < incoming.length; ci++) {
                var okc = matchCard(incoming[ci], srvOfNode);
                incoming[ci].hidden = !okc;
                if (okc) kept++;
              }
              node.hidden = kept === 0;
              var cntEl = node.querySelector('.sc-gen-h i');
              if (cntEl) cntEl.textContent = kept + ' 首';
            }
            ph.parentNode.replaceChild(node, ph);
            // 新块里的卡片立刻套上当前排序，否则滚下去看到的是服务端默认序
            sortCards(node.querySelectorAll('.sc-card'));
            // 高度从「按 data-count 估」换成「按真实卡数算」，一并把块头量准
            refreshIntrinsic();
            return node;
          })
          .catch(function (err) {
            /* 重试也失败：标记为失败但**留在页面上**。它仍然是「这段数据没有」，
               所以不该让空态/命中数装作算完了（宁可停在「…」并说明原因）；
               块内那句「加载中…」由 CSS 按 data-fail 改成「加载失败，刷新重试」。 */
            ph.setAttribute('data-fail', '1');
            // 骨架里那句 status 是给读屏的（视觉上 1px 裁掉，多一行会撑高占位），
            // 所以「失败」只能靠这条文案与命中条上的说明，别在这里加可见文字。
            var st = ph.querySelector('.sc-ph-status');
            if (st) st.textContent = '该世代加载失败，刷新重试';
            throw err;
          });
      }
      /** 拉齐所有骨架（筛选用）。并发 3：每一段都是一次 SSR，太多会把 Worker 打回原形。 */
      function ensureAll() {
        var list = root.querySelectorAll('.sc-gen-ph');
        var todo = [];
        for (var i = 0; i < list.length; i++) todo.push(list[i]);
        var idx = 0;
        function worker() {
          if (idx >= todo.length) return Promise.resolve();
          var el = todo[idx++];
          // 已被 IntersectionObserver 换掉的就跳过（它已经不在文档里）
          if (!el.parentNode) return worker();
          return loadFrag(el).catch(function () {}).then(worker);
        }
        var runs = [];
        for (var w = 0; w < 3; w++) runs.push(worker());
        return Promise.all(runs);
      }
      function observeSkeletons() {
        if (!hasSkeletons()) return;
        // 没有 IntersectionObserver（极老浏览器）就退化成「全部补拉」，功能优先
        if (!('IntersectionObserver' in window)) {
          lazyState = 1;
          ensureAll().then(function () { lazyState = 2; apply(); });
          return;
        }
        // rootMargin 1200px：提前一屏多开始拉，滚到那里时通常已经就位
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.isIntersecting) continue;
            io.unobserve(e.target);
            loadFrag(e.target)
              .then(function () {
                // 若此刻有筛选条件，新到的卡片要重新参与匹配：
                // 把状态打回 0，让 apply 的守卫去走「先补拉再一次算完」
                if (hasFilters()) { lazyState = 0; apply(); }
              })
              .catch(function () {});
          }
        }, { rootMargin: '1200px 0px' });
        var nodes = root.querySelectorAll('.sc-gen-ph');
        for (var n = 0; n < nodes.length; n++) io.observe(nodes[n]);
      }

      // ---- 启动顺序（2026-10-30 加存档后必须严格按这个顺序）----
      //  ① 读存档填进 state（此时还不动 DOM）
      //  ② 把 state 同步到控件（chip 高亮 / 下拉文字 / 搜索框 / 限时曲勾选）
      //  ③ 最后一次 apply() 真正渲染结果
      // 为什么必须等这里：syncControlsFromState → ddRefresh → ddSync 依赖 dds 数组，
      // 而 dds 是在上面那句 ddInit 之后才被 push 满的。早一步调用会拿到空数组，
      // 结果就是"筛选生效了、但下拉按钮上还写着『全部』"。
      loadSaved();
      // 排列方式先落到 <html> 上再 apply：apply 里的 refreshIntrinsic 会按当前布局量卡高，
      // 晚一步写属性就会先按卡片排列量一遍、再按列表量一遍（白读一次几何）。
      document.documentElement.setAttribute('data-view', state.view);
      syncControlsFromState();
      apply();
      // 首屏那几块渲染完、视口稳定之后再挂观察器：早挂会在首次 apply 前触发，
      // 拿到的是还没算好高度的骨架块，rootMargin 会把它们一次性全判成"进入了"。
      observeSkeletons();
    })();
