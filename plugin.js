"use strict";
(() => {
  // src/bytes.ts
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function utf8Bytes(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code >= 55296 && code <= 56319 && i + 1 < text.length) {
        const low = text.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          code = (code - 55296 << 10) + (low - 56320) + 65536;
          i++;
        }
      }
      if (code < 128) out.push(code);
      else if (code < 2048) out.push(192 | code >> 6, 128 | code & 63);
      else if (code < 65536) out.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
      else out.push(240 | code >> 18, 128 | code >> 12 & 63, 128 | code >> 6 & 63, 128 | code & 63);
    }
    return Uint8Array.from(out);
  }
  function utf8Text(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte < 128) out += String.fromCharCode(byte);
      else if (byte < 224) out += String.fromCharCode((byte & 31) << 6 | bytes[++i] & 63);
      else if (byte < 240) {
        out += String.fromCharCode((byte & 15) << 12 | (bytes[++i] & 63) << 6 | bytes[++i] & 63);
      } else {
        const code = (byte & 7) << 18 | (bytes[++i] & 63) << 12 | (bytes[++i] & 63) << 6 | bytes[++i] & 63;
        out += String.fromCharCode(55296 + (code - 65536 >> 10), 56320 + (code - 65536 & 1023));
      }
    }
    return out;
  }
  function base64Encode(text) {
    const bytes = utf8Bytes(text);
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : -1;
      const c = i + 2 < bytes.length ? bytes[i + 2] : -1;
      out += B64[a >> 2];
      out += B64[(a & 3) << 4 | (b === -1 ? 0 : b >> 4)];
      out += b === -1 ? "=" : B64[(b & 15) << 2 | (c === -1 ? 0 : c >> 6)];
      out += c === -1 ? "=" : B64[c & 63];
    }
    return out;
  }
  function base64NoPadding(text) {
    return base64Encode(text).replace(/=+$/, "");
  }
  function base64DecodeBytes(text) {
    const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
    const bytes = [];
    for (let i = 0; i < clean.length; i += 4) {
      const a = B64.indexOf(clean[i]);
      const b = B64.indexOf(clean[i + 1]);
      const c = B64.indexOf(clean[i + 2]);
      const d = B64.indexOf(clean[i + 3]);
      bytes.push((a << 2 | b >> 4) & 255);
      if (c !== -1) bytes.push(((b & 15) << 4 | c >> 2) & 255);
      if (d !== -1) bytes.push(((c & 3) << 6 | d) & 255);
    }
    return Uint8Array.from(bytes);
  }
  function base64DecodeText(text) {
    return utf8Text(base64DecodeBytes(text));
  }

  // src/blowfish.ts
  var P_INIT = [
    608135816,
    2242054355,
    320440878,
    57701188,
    2752067618,
    698298832,
    137296536,
    3964562569,
    1160258022,
    953160567,
    3193202383,
    887688300,
    3232508343,
    3380367581,
    1065670069,
    3041331479,
    2450970073,
    2306472731
  ];
  var S_INIT = [
    3509652390,
    2564797868,
    805139163,
    3491422135,
    3101798381,
    1780907670,
    3128725573,
    4046225305,
    614570311,
    3012652279,
    134345442,
    2240740374,
    1667834072,
    1901547113,
    2757295779,
    4103290238,
    227898511,
    1921955416,
    1904987480,
    2182433518,
    2069144605,
    3260701109,
    2620446009,
    720527379,
    3318853667,
    677414384,
    3393288472,
    3101374703,
    2390351024,
    1614419982,
    1822297739,
    2954791486,
    3608508353,
    3174124327,
    2024746970,
    1432378464,
    3864339955,
    2857741204,
    1464375394,
    1676153920,
    1439316330,
    715854006,
    3033291828,
    289532110,
    2706671279,
    2087905683,
    3018724369,
    1668267050,
    732546397,
    1947742710,
    3462151702,
    2609353502,
    2950085171,
    1814351708,
    2050118529,
    680887927,
    999245976,
    1800124847,
    3300911131,
    1713906067,
    1641548236,
    4213287313,
    1216130144,
    1575780402,
    4018429277,
    3917837745,
    3693486850,
    3949271944,
    596196993,
    3549867205,
    258830323,
    2213823033,
    772490370,
    2760122372,
    1774776394,
    2652871518,
    566650946,
    4142492826,
    1728879713,
    2882767088,
    1783734482,
    3629395816,
    2517608232,
    2874225571,
    1861159788,
    326777828,
    3124490320,
    2130389656,
    2716951837,
    967770486,
    1724537150,
    2185432712,
    2364442137,
    1164943284,
    2105845187,
    998989502,
    3765401048,
    2244026483,
    1075463327,
    1455516326,
    1322494562,
    910128902,
    469688178,
    1117454909,
    936433444,
    3490320968,
    3675253459,
    1240580251,
    122909385,
    2157517691,
    634681816,
    4142456567,
    3825094682,
    3061402683,
    2540495037,
    79693498,
    3249098678,
    1084186820,
    1583128258,
    426386531,
    1761308591,
    1047286709,
    322548459,
    995290223,
    1845252383,
    2603652396,
    3431023940,
    2942221577,
    3202600964,
    3727903485,
    1712269319,
    422464435,
    3234572375,
    1170764815,
    3523960633,
    3117677531,
    1434042557,
    442511882,
    3600875718,
    1076654713,
    1738483198,
    4213154764,
    2393238008,
    3677496056,
    1014306527,
    4251020053,
    793779912,
    2902807211,
    842905082,
    4246964064,
    1395751752,
    1040244610,
    2656851899,
    3396308128,
    445077038,
    3742853595,
    3577915638,
    679411651,
    2892444358,
    2354009459,
    1767581616,
    3150600392,
    3791627101,
    3102740896,
    284835224,
    4246832056,
    1258075500,
    768725851,
    2589189241,
    3069724005,
    3532540348,
    1274779536,
    3789419226,
    2764799539,
    1660621633,
    3471099624,
    4011903706,
    913787905,
    3497959166,
    737222580,
    2514213453,
    2928710040,
    3937242737,
    1804850592,
    3499020752,
    2949064160,
    2386320175,
    2390070455,
    2415321851,
    4061277028,
    2290661394,
    2416832540,
    1336762016,
    1754252060,
    3520065937,
    3014181293,
    791618072,
    3188594551,
    3933548030,
    2332172193,
    3852520463,
    3043980520,
    413987798,
    3465142937,
    3030929376,
    4245938359,
    2093235073,
    3534596313,
    375366246,
    2157278981,
    2479649556,
    555357303,
    3870105701,
    2008414854,
    3344188149,
    4221384143,
    3956125452,
    2067696032,
    3594591187,
    2921233993,
    2428461,
    544322398,
    577241275,
    1471733935,
    610547355,
    4027169054,
    1432588573,
    1507829418,
    2025931657,
    3646575487,
    545086370,
    48609733,
    2200306550,
    1653985193,
    298326376,
    1316178497,
    3007786442,
    2064951626,
    458293330,
    2589141269,
    3591329599,
    3164325604,
    727753846,
    2179363840,
    146436021,
    1461446943,
    4069977195,
    705550613,
    3059967265,
    3887724982,
    4281599278,
    3313849956,
    1404054877,
    2845806497,
    146425753,
    1854211946,
    1266315497,
    3048417604,
    3681880366,
    3289982499,
    290971e4,
    1235738493,
    2632868024,
    2414719590,
    3970600049,
    1771706367,
    1449415276,
    3266420449,
    422970021,
    1963543593,
    2690192192,
    3826793022,
    1062508698,
    1531092325,
    1804592342,
    2583117782,
    2714934279,
    4024971509,
    1294809318,
    4028980673,
    1289560198,
    2221992742,
    1669523910,
    35572830,
    157838143,
    1052438473,
    1016535060,
    1802137761,
    1753167236,
    1386275462,
    3080475397,
    2857371447,
    1040679964,
    2145300060,
    2390574316,
    1461121720,
    2956646967,
    4031777805,
    4028374788,
    33600511,
    2920084762,
    1018524850,
    629373528,
    3691585981,
    3515945977,
    2091462646,
    2486323059,
    586499841,
    988145025,
    935516892,
    3367335476,
    2599673255,
    2839830854,
    265290510,
    3972581182,
    2759138881,
    3795373465,
    1005194799,
    847297441,
    406762289,
    1314163512,
    1332590856,
    1866599683,
    4127851711,
    750260880,
    613907577,
    1450815602,
    3165620655,
    3734664991,
    3650291728,
    3012275730,
    3704569646,
    1427272223,
    778793252,
    1343938022,
    2676280711,
    2052605720,
    1946737175,
    3164576444,
    3914038668,
    3967478842,
    3682934266,
    1661551462,
    3294938066,
    4011595847,
    840292616,
    3712170807,
    616741398,
    312560963,
    711312465,
    1351876610,
    322626781,
    1910503582,
    271666773,
    2175563734,
    1594956187,
    70604529,
    3617834859,
    1007753275,
    1495573769,
    4069517037,
    2549218298,
    2663038764,
    504708206,
    2263041392,
    3941167025,
    2249088522,
    1514023603,
    1998579484,
    1312622330,
    694541497,
    2582060303,
    2151582166,
    1382467621,
    776784248,
    2618340202,
    3323268794,
    2497899128,
    2784771155,
    503983604,
    4076293799,
    907881277,
    423175695,
    432175456,
    1378068232,
    4145222326,
    3954048622,
    3938656102,
    3820766613,
    2793130115,
    2977904593,
    26017576,
    3274890735,
    3194772133,
    1700274565,
    1756076034,
    4006520079,
    3677328699,
    720338349,
    1533947780,
    354530856,
    688349552,
    3973924725,
    1637815568,
    332179504,
    3949051286,
    53804574,
    2852348879,
    3044236432,
    1282449977,
    3583942155,
    3416972820,
    4006381244,
    1617046695,
    2628476075,
    3002303598,
    1686838959,
    431878346,
    2686675385,
    1700445008,
    1080580658,
    1009431731,
    832498133,
    3223435511,
    2605976345,
    2271191193,
    2516031870,
    1648197032,
    4164389018,
    2548247927,
    300782431,
    375919233,
    238389289,
    3353747414,
    2531188641,
    2019080857,
    1475708069,
    455242339,
    2609103871,
    448939670,
    3451063019,
    1395535956,
    2413381860,
    1841049896,
    1491858159,
    885456874,
    4264095073,
    4001119347,
    1565136089,
    3898914787,
    1108368660,
    540939232,
    1173283510,
    2745871338,
    3681308437,
    4207628240,
    3343053890,
    4016749493,
    1699691293,
    1103962373,
    3625875870,
    2256883143,
    3830138730,
    1031889488,
    3479347698,
    1535977030,
    4236805024,
    3251091107,
    2132092099,
    1774941330,
    1199868427,
    1452454533,
    157007616,
    2904115357,
    342012276,
    595725824,
    1480756522,
    206960106,
    497939518,
    591360097,
    863170706,
    2375253569,
    3596610801,
    1814182875,
    2094937945,
    3421402208,
    1082520231,
    3463918190,
    2785509508,
    435703966,
    3908032597,
    1641649973,
    2842273706,
    3305899714,
    1510255612,
    2148256476,
    2655287854,
    3276092548,
    4258621189,
    236887753,
    3681803219,
    274041037,
    1734335097,
    3815195456,
    3317970021,
    1899903192,
    1026095262,
    4050517792,
    356393447,
    2410691914,
    3873677099,
    3682840055,
    3913112168,
    2491498743,
    4132185628,
    2489919796,
    1091903735,
    1979897079,
    3170134830,
    3567386728,
    3557303409,
    857797738,
    1136121015,
    1342202287,
    507115054,
    2535736646,
    337727348,
    3213592640,
    1301675037,
    2528481711,
    1895095763,
    1721773893,
    3216771564,
    62756741,
    2142006736,
    835421444,
    2531993523,
    1442658625,
    3659876326,
    2882144922,
    676362277,
    1392781812,
    170690266,
    3921047035,
    1759253602,
    3611846912,
    1745797284,
    664899054,
    1329594018,
    3901205900,
    3045908486,
    2062866102,
    2865634940,
    3543621612,
    3464012697,
    1080764994,
    553557557,
    3656615353,
    3996768171,
    991055499,
    499776247,
    1265440854,
    648242737,
    3940784050,
    980351604,
    3713745714,
    1749149687,
    3396870395,
    4211799374,
    3640570775,
    1161844396,
    3125318951,
    1431517754,
    545492359,
    4268468663,
    3499529547,
    1437099964,
    2702547544,
    3433638243,
    2581715763,
    2787789398,
    1060185593,
    1593081372,
    2418618748,
    4260947970,
    69676912,
    2159744348,
    86519011,
    2512459080,
    3838209314,
    1220612927,
    3339683548,
    133810670,
    1090789135,
    1078426020,
    1569222167,
    845107691,
    3583754449,
    4072456591,
    1091646820,
    628848692,
    1613405280,
    3757631651,
    526609435,
    236106946,
    48312990,
    2942717905,
    3402727701,
    1797494240,
    859738849,
    992217954,
    4005476642,
    2243076622,
    3870952857,
    3732016268,
    765654824,
    3490871365,
    2511836413,
    1685915746,
    3888969200,
    1414112111,
    2273134842,
    3281911079,
    4080962846,
    172450625,
    2569994100,
    980381355,
    4109958455,
    2819808352,
    2716589560,
    2568741196,
    3681446669,
    3329971472,
    1835478071,
    660984891,
    3704678404,
    4045999559,
    3422617507,
    3040415634,
    1762651403,
    1719377915,
    3470491036,
    2693910283,
    3642056355,
    3138596744,
    1364962596,
    2073328063,
    1983633131,
    926494387,
    3423689081,
    2150032023,
    4096667949,
    1749200295,
    3328846651,
    309677260,
    2016342300,
    1779581495,
    3079819751,
    111262694,
    1274766160,
    443224088,
    298511866,
    1025883608,
    3806446537,
    1145181785,
    168956806,
    3641502830,
    3584813610,
    1689216846,
    3666258015,
    3200248200,
    1692713982,
    2646376535,
    4042768518,
    1618508792,
    1610833997,
    3523052358,
    4130873264,
    2001055236,
    3610705100,
    2202168115,
    4028541809,
    2961195399,
    1006657119,
    2006996926,
    3186142756,
    1430667929,
    3210227297,
    1314452623,
    4074634658,
    4101304120,
    2273951170,
    1399257539,
    3367210612,
    3027628629,
    1190975929,
    2062231137,
    2333990788,
    2221543033,
    2438960610,
    1181637006,
    548689776,
    2362791313,
    3372408396,
    3104550113,
    3145860560,
    296247880,
    1970579870,
    3078560182,
    3769228297,
    1714227617,
    3291629107,
    3898220290,
    166772364,
    1251581989,
    493813264,
    448347421,
    195405023,
    2709975567,
    677966185,
    3703036547,
    1463355134,
    2715995803,
    1338867538,
    1343315457,
    2802222074,
    2684532164,
    233230375,
    2599980071,
    2000651841,
    3277868038,
    1638401717,
    4028070440,
    3237316320,
    6314154,
    819756386,
    300326615,
    590932579,
    1405279636,
    3267499572,
    3150704214,
    2428286686,
    3959192993,
    3461946742,
    1862657033,
    1266418056,
    963775037,
    2089974820,
    2263052895,
    1917689273,
    448879540,
    3550394620,
    3981727096,
    150775221,
    3627908307,
    1303187396,
    508620638,
    2975983352,
    2726630617,
    1817252668,
    1876281319,
    1457606340,
    908771278,
    3720792119,
    3617206836,
    2455994898,
    1729034894,
    1080033504,
    976866871,
    3556439503,
    2881648439,
    1522871579,
    1555064734,
    1336096578,
    3548522304,
    2579274686,
    3574697629,
    3205460757,
    3593280638,
    3338716283,
    3079412587,
    564236357,
    2993598910,
    1781952180,
    1464380207,
    3163844217,
    3332601554,
    1699332808,
    1393555694,
    1183702653,
    3581086237,
    1288719814,
    691649499,
    2847557200,
    2895455976,
    3193889540,
    2717570544,
    1781354906,
    1676643554,
    2592534050,
    3230253752,
    1126444790,
    2770207658,
    2633158820,
    2210423226,
    2615765581,
    2414155088,
    3127139286,
    673620729,
    2805611233,
    1269405062,
    4015350505,
    3341807571,
    4149409754,
    1057255273,
    2012875353,
    2162469141,
    2276492801,
    2601117357,
    993977747,
    3918593370,
    2654263191,
    753973209,
    36408145,
    2530585658,
    25011837,
    3520020182,
    2088578344,
    530523599,
    2918365339,
    1524020338,
    1518925132,
    3760827505,
    3759777254,
    1202760957,
    3985898139,
    3906192525,
    674977740,
    4174734889,
    2031300136,
    2019492241,
    3983892565,
    4153806404,
    3822280332,
    352677332,
    2297720250,
    60907813,
    90501309,
    3286998549,
    1016092578,
    2535922412,
    2839152426,
    457141659,
    509813237,
    4120667899,
    652014361,
    1966332200,
    2975202805,
    55981186,
    2327461051,
    676427537,
    3255491064,
    2882294119,
    3433927263,
    1307055953,
    942726286,
    933058658,
    2468411793,
    3933900994,
    4215176142,
    1361170020,
    2001714738,
    2830558078,
    3274259782,
    1222529897,
    1679025792,
    2729314320,
    3714953764,
    1770335741,
    151462246,
    3013232138,
    1682292957,
    1483529935,
    471910574,
    1539241949,
    458788160,
    3436315007,
    1807016891,
    3718408830,
    978976581,
    1043663428,
    3165965781,
    1927990952,
    4200891579,
    2372276910,
    3208408903,
    3533431907,
    1412390302,
    2931980059,
    4132332400,
    1947078029,
    3881505623,
    4168226417,
    2941484381,
    1077988104,
    1320477388,
    886195818,
    18198404,
    3786409e3,
    2509781533,
    112762804,
    3463356488,
    1866414978,
    891333506,
    18488651,
    661792760,
    1628790961,
    3885187036,
    3141171499,
    876946877,
    2693282273,
    1372485963,
    791857591,
    2686433993,
    3759982718,
    3167212022,
    3472953795,
    2716379847,
    445679433,
    3561995674,
    3504004811,
    3574258232,
    54117162,
    3331405415,
    2381918588,
    3769707343,
    4154350007,
    1140177722,
    4074052095,
    668550556,
    3214352940,
    367459370,
    261225585,
    2610173221,
    4209349473,
    3468074219,
    3265815641,
    314222801,
    3066103646,
    3808782860,
    282218597,
    3406013506,
    3773591054,
    379116347,
    1285071038,
    846784868,
    2669647154,
    3771962079,
    3550491691,
    2305946142,
    453669953,
    1268987020,
    3317592352,
    3279303384,
    3744833421,
    2610507566,
    3859509063,
    266596637,
    3847019092,
    517658769,
    3462560207,
    3443424879,
    370717030,
    4247526661,
    2224018117,
    4143653529,
    4112773975,
    2788324899,
    2477274417,
    1456262402,
    2901442914,
    1517677493,
    1846949527,
    2295493580,
    3734397586,
    2176403920,
    1280348187,
    1908823572,
    3871786941,
    846861322,
    1172426758,
    3287448474,
    3383383037,
    1655181056,
    3139813346,
    901632758,
    1897031941,
    2986607138,
    3066810236,
    3447102507,
    1393639104,
    373351379,
    950779232,
    625454576,
    3124240540,
    4148612726,
    2007998917,
    544563296,
    2244738638,
    2330496472,
    2058025392,
    1291430526,
    424198748,
    50039436,
    29584100,
    3605783033,
    2429876329,
    2791104160,
    1057563949,
    3255363231,
    3075367218,
    3463963227,
    1469046755,
    985887462
  ];

  // src/bcrypt.ts
  var ALPHABET = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  function charCode(char) {
    return ALPHABET.indexOf(char);
  }
  function decodeBase64(text, maxLength) {
    const out = new Uint8Array(maxLength);
    let offset = 0;
    let produced = 0;
    while (offset < text.length - 1 && produced < maxLength) {
      const c1 = charCode(text[offset++]);
      const c2 = charCode(text[offset++]);
      if (c1 < 0 || c2 < 0) break;
      out[produced++] = (c1 << 2 | (c2 & 48) >> 4) & 255;
      if (produced >= maxLength || offset >= text.length) break;
      const c3 = charCode(text[offset++]);
      if (c3 < 0) break;
      out[produced++] = ((c2 & 15) << 4 | (c3 & 60) >> 2) & 255;
      if (produced >= maxLength || offset >= text.length) break;
      const c4 = charCode(text[offset++]);
      if (c4 < 0) break;
      out[produced++] = ((c3 & 3) << 6 | c4) & 255;
    }
    return out.subarray(0, produced);
  }
  function encodeBase64(data, length) {
    let out = "";
    let offset = 0;
    while (offset < length) {
      let c1 = data[offset++] & 255;
      out += ALPHABET[c1 >> 2 & 63];
      c1 = (c1 & 3) << 4;
      if (offset >= length) {
        out += ALPHABET[c1 & 63];
        break;
      }
      let c2 = data[offset++] & 255;
      c1 |= c2 >> 4 & 15;
      out += ALPHABET[c1 & 63];
      c1 = (c2 & 15) << 2;
      if (offset >= length) {
        out += ALPHABET[c1 & 63];
        break;
      }
      c2 = data[offset++] & 255;
      c1 |= c2 >> 6 & 3;
      out += ALPHABET[c1 & 63];
      out += ALPHABET[c2 & 63];
    }
    return out;
  }
  function streamToWord(data, cursor) {
    let word = 0;
    for (let i = 0; i < 4; i++) {
      word = (word << 8 | data[cursor.offset]) >>> 0;
      cursor.offset = (cursor.offset + 1) % data.length;
    }
    return word;
  }
  function newState() {
    return { p: Uint32Array.from(P_INIT), s: Uint32Array.from(S_INIT) };
  }
  function f(state, x) {
    const s = state.s;
    return (s[x >>> 24 & 255] + s[256 | x >>> 16 & 255] >>> 0 ^ s[512 | x >>> 8 & 255]) + s[768 | x & 255] >>> 0;
  }
  function encipher(state, block) {
    const { p } = state;
    let l = block[0];
    let r = block[1];
    for (let i = 0; i < 16; i++) {
      l ^= p[i];
      r ^= f(state, l);
      const swap2 = l;
      l = r;
      r = swap2;
    }
    const swap = l;
    l = r;
    r = swap;
    r ^= p[16];
    l ^= p[17];
    block[0] = l >>> 0;
    block[1] = r >>> 0;
  }
  function expandKey(state, key) {
    const { p, s } = state;
    const cursor = { offset: 0 };
    for (let i = 0; i < p.length; i++) p[i] = (p[i] ^ streamToWord(key, cursor)) >>> 0;
    const block = new Uint32Array(2);
    for (let i = 0; i < p.length; i += 2) {
      encipher(state, block);
      p[i] = block[0];
      p[i + 1] = block[1];
    }
    for (let i = 0; i < s.length; i += 2) {
      encipher(state, block);
      s[i] = block[0];
      s[i + 1] = block[1];
    }
  }
  function expandKeySalted(state, salt, key) {
    const { p, s } = state;
    const keyCursor = { offset: 0 };
    const saltCursor = { offset: 0 };
    for (let i = 0; i < p.length; i++) p[i] = (p[i] ^ streamToWord(key, keyCursor)) >>> 0;
    const block = new Uint32Array(2);
    for (let i = 0; i < p.length; i += 2) {
      block[0] = (block[0] ^ streamToWord(salt, saltCursor)) >>> 0;
      block[1] = (block[1] ^ streamToWord(salt, saltCursor)) >>> 0;
      encipher(state, block);
      p[i] = block[0];
      p[i + 1] = block[1];
    }
    for (let i = 0; i < s.length; i += 2) {
      block[0] = (block[0] ^ streamToWord(salt, saltCursor)) >>> 0;
      block[1] = (block[1] ^ streamToWord(salt, saltCursor)) >>> 0;
      encipher(state, block);
      s[i] = block[0];
      s[i + 1] = block[1];
    }
  }
  function bcryptHash(password, cost, salt) {
    const key = utf8Bytes(`${password}\0`);
    const saltBytes = decodeBase64(salt, 16);
    if (key.length === 0) throw new Error("bcrypt needs a password");
    if (saltBytes.length !== 16) throw new Error("bcrypt needs a 16-byte salt");
    const state = newState();
    expandKeySalted(state, saltBytes, key);
    const rounds = 1 << cost;
    for (let i = 0; i < rounds; i++) {
      expandKey(state, key);
      expandKey(state, saltBytes);
    }
    const cipher = utf8Bytes("OrpheanBeholderScryDoubt");
    const block = new Uint32Array(2);
    for (let round = 0; round < 64; round++) {
      for (let offset = 0; offset < cipher.length; offset += 8) {
        block[0] = cipher[offset] << 24 | cipher[offset + 1] << 16 | cipher[offset + 2] << 8 | cipher[offset + 3];
        block[1] = cipher[offset + 4] << 24 | cipher[offset + 5] << 16 | cipher[offset + 6] << 8 | cipher[offset + 7];
        encipher(state, block);
        cipher[offset] = block[0] >>> 24 & 255;
        cipher[offset + 1] = block[0] >>> 16 & 255;
        cipher[offset + 2] = block[0] >>> 8 & 255;
        cipher[offset + 3] = block[0] & 255;
        cipher[offset + 4] = block[1] >>> 24 & 255;
        cipher[offset + 5] = block[1] >>> 16 & 255;
        cipher[offset + 6] = block[1] >>> 8 & 255;
        cipher[offset + 7] = block[1] & 255;
      }
    }
    const costText = cost < 10 ? `0${cost}` : String(cost);
    return `$2a$${costText}$${encodeBase64(saltBytes, 16)}${encodeBase64(cipher, 23)}`;
  }

  // src/md5.ts
  var K = [
    3614090360,
    3905402710,
    606105819,
    3250441966,
    4118548399,
    1200080426,
    2821735955,
    4249261313,
    1770035416,
    2336552879,
    4294925233,
    2304563134,
    1804603682,
    4254626195,
    2792965006,
    1236535329,
    4129170786,
    3225465664,
    643717713,
    3921069994,
    3593408605,
    38016083,
    3634488961,
    3889429448,
    568446438,
    3275163606,
    4107603335,
    1163531501,
    2850285829,
    4243563512,
    1735328473,
    2368359562,
    4294588738,
    2272392833,
    1839030562,
    4259657740,
    2763975236,
    1272893353,
    4139469664,
    3200236656,
    681279174,
    3936430074,
    3572445317,
    76029189,
    3654602809,
    3873151461,
    530742520,
    3299628645,
    4096336452,
    1126891415,
    2878612391,
    4237533241,
    1700485571,
    2399980690,
    4293915773,
    2240044497,
    1873313359,
    4264355552,
    2734768916,
    1309151649,
    4149444226,
    3174756917,
    718787259,
    3951481745
  ];
  var S = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ];
  function md5(text) {
    const bytes = utf8Bytes(text);
    const length = bytes.length;
    const padded = new Uint8Array((length + 8 >> 6) + 1 << 6);
    padded.set(bytes);
    padded[length] = 128;
    const totalBits = length * 8;
    for (let i = 0; i < 4; i++) padded[padded.length - 8 + i] = totalBits >>> 8 * i & 255;
    const high = Math.floor(length / 536870912);
    for (let i = 0; i < 4; i++) padded[padded.length - 4 + i] = high >>> 8 * i & 255;
    let a = 1732584193;
    let b = 4023233417;
    let c = 2562383102;
    let d = 271733878;
    const words = new Uint32Array(16);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const base = offset + i * 4;
        words[i] = (padded[base] | padded[base + 1] << 8 | padded[base + 2] << 16 | padded[base + 3] << 24) >>> 0;
      }
      let aa = a;
      let bb = b;
      let cc = c;
      let dd = d;
      for (let i = 0; i < 64; i++) {
        let f2;
        let g;
        if (i < 16) {
          f2 = bb & cc | ~bb & dd;
          g = i;
        } else if (i < 32) {
          f2 = dd & bb | ~dd & cc;
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          f2 = bb ^ cc ^ dd;
          g = (3 * i + 5) % 16;
        } else {
          f2 = cc ^ (bb | ~dd);
          g = 7 * i % 16;
        }
        const sum = aa + f2 + K[i] + words[g] >>> 0;
        aa = dd;
        dd = cc;
        cc = bb;
        bb = bb + (sum << S[i] | sum >>> 32 - S[i]) >>> 0;
      }
      a = a + aa >>> 0;
      b = b + bb >>> 0;
      c = c + cc >>> 0;
      d = d + dd >>> 0;
    }
    let hex = "";
    for (const value of [a, b, c, d]) {
      for (let i = 0; i < 4; i++) {
        const byte = value >>> 8 * i & 255;
        hex += (byte < 16 ? "0" : "") + byte.toString(16);
      }
    }
    return hex;
  }

  // src/coolapk.ts
  var API_ORIGIN = "https://api.coolapk.com";
  var WEB_ORIGIN = "https://www.coolapk.com";
  var LOGIN_URL = "https://account.coolapk.com/auth/login?type=mobile";
  var APP_ID = "com.coolapk.market";
  var VERSION_NAME = "16.7.0";
  var VERSION_CODE = "2610291";
  var API_VERSION = "16";
  var SDK_INT = "34";
  var ANDROID_VERSION = "14";
  var MODEL = "Pixel 7";
  var BUILD_NUMBER = "TQ3A.230901.001";
  var ALPHABET2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var LOOKUP_B64 = "VFRCVU9GUXNRMEVsTFVNa1dERWpRU0VzVXlFbUxETkFVeTFEUEZZdUl5MGlNVU01SXpCVUpGY3RNeWtoTVVRMUpTMURPU1V4TXpoUUxWTXdWMDBzSXloU01UUXNXVEZEUkZFd1EwUlZNU1FrVVMwaktTTXRKRGhZTFZRa1VqRXpLU1FzTTBCVkxUUXdVaTAwTlNNc00yQlhMVk1sSkMxRE5GbE5MQ1EwV1RFekxTUXhRMEVoTEVNbElqRXpLRmN3TXowbExpTkVWekVqUFNZdU5Ea2tMRk13Vml4VEtGa3RRemhYTEZNc1dDNGpMU1l0VTJCVFRUQTBMRkV1TXpoVExqTWhJakZETUZNc0kwQlZMQ1FrVUN3ekpTSXNJekJTTUVNOFVDeEVMU0l0STJCUUxVUW9VeTBqTEZNc0l5VWtNRlF3VmswdFJDeFlNVE1sSkM0ME5TRXdVMFJRTEZNaElpMGtOU013VTJCUUxqTmdVeXdqT0ZFc05DeFRMRU13V0N4VUxTRXRJeVJUTEROQkl5MDBKRlpOTVVNc1VEQkVKRmd0TkMwa0xEUWtXQzFETUZNeFJDa2pMVk0wVml4VE1GZ3hJeTBtTFZNeEpTMHpKRlF4TTJCUUxTUTRXVEJETUZNdUkwVWhUU3d6UEZndFJEQlJNRE5FVVMwak9GWXVKRGtsTVNRMFV6QXpOU013UkRra01UTWtWU3hVTUZRdFJDeFlNVE5GSXl4RUxGWXNJelVoTGlRMFYwMHhOQ3hWTENNMFZ5NHpKRlV4TkN4VExGUTRWeTRqWUZZeEpEVWpMVU13VXpGRFBGSXNNMEVsTERNc1ZEQTBPU011TkNrbUxFUWtWaXhFTVNKTkxUTW9VaXd6TEZjdFUwUlFMaVF3VlRGREpTVXdVeWtqTVVNaEl5MHpJU1VzSTBFak1UTXdVUzFVTkZjeFJERWxMVVF0SlM0a05GSXNJemhaVFRCVFlGRXdReVJZTFNNbElTNDBMRmdzVkRSWkxVUW9XVEJEUUZZdFJDeFdMak5FVkRCRE1Ga3RORFVsTEZRNFZTMVVKRmd3TXpSV0xEUTRVVTB3UXkwbUxVUTRXUzFUTVNNc1V5VWlNVU5BVVN4VUxGWXVJMFJVTGlNc1dERkVMRk14STJCUUxWTTBXUzRrT0Zjd00wUlhMVk1vV0MwaktGRXhMQ00wVml4VE5GQXRSRFJXTFVRbEpDMVRKRkF3TkN4Z1lB";
  var lookup = base64DecodeBytes(LOOKUP_B64);
  function deviceHeader(deviceId) {
    const raw = `${deviceId}; ; ; ; Google; google; ${MODEL}; ${BUILD_NUMBER}; null`;
    return base64NoPadding(raw).split("").reverse().join("");
  }
  function userAgent() {
    return `Dalvik/2.1.0 (Linux; U; Android ${ANDROID_VERSION}; ${MODEL} ${BUILD_NUMBER}) (#Build; google; ${MODEL}; ${BUILD_NUMBER}; ${ANDROID_VERSION}) +CoolMarket/${VERSION_NAME}-${VERSION_CODE}-universal`;
  }
  function tokenV3(device, appCode, timestampSeconds) {
    return __tokenV3(device, appCode, timestampSeconds).token;
  }
  function __tokenV3(device, appCode, timestampSeconds) {
    const code = Number.parseInt(appCode, 10) || 2610291;
    for (let offset = 0; offset <= 15; offset++) {
      const time = timestampSeconds + offset;
      const index = ((time + code) % 100 + 100) % 100 * 4 + 128;
      const slice = lookup.subarray(index, index + 128);
      let encoded = "";
      for (let i = 0; i < slice.length; i++) encoded += String.fromCharCode(slice[i]);
      const segment = base64DecodeText(encoded);
      const plain = `com.coolapk.market&${segment}&${md5(device)}&${time}&${code}`;
      const password = md5(base64Encode(plain));
      const source = base64NoPadding(`${time.toString(16)}/${md5(plain)}`).slice(0, 22);
      const lastIndex = (ALPHABET2.indexOf(source[21]) - 5 + 64) % 64;
      const salt = source.slice(0, 21) + ALPHABET2[lastIndex];
      if (!/^[./A-Za-z0-9]{22}$/.test(salt)) continue;
      const hash = `$2y${bcryptHash(password, 4, salt).slice(3)}`;
      return { token: `v3${base64NoPadding(hash)}`, salt, offset };
    }
    throw new Error("coolapk token unavailable");
  }
  function accountHeaders(credential) {
    const device = deviceHeader(credential.deviceId);
    const seconds = Math.floor(Date.now() / 1e3);
    return {
      "User-Agent": userAgent(),
      "X-Requested-With": "XMLHttpRequest",
      "X-Sdk-Int": SDK_INT,
      "X-Sdk-Locale": "zh-CN",
      "X-App-Id": APP_ID,
      "X-App-Token": tokenV3(device, VERSION_CODE, seconds),
      "X-App-Version": VERSION_NAME,
      "X-App-Code": VERSION_CODE,
      "X-Api-Version": API_VERSION,
      "X-App-Device": device,
      "X-Dark-Mode": "0",
      "X-App-Channel": "coolapk",
      "X-App-Mode": "universal",
      "X-App-Supported": VERSION_CODE
    };
  }
  function queryString(params) {
    const parts = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === void 0 || value === null || value === "") continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
    return parts.length ? `?${parts.join("&")}` : "";
  }
  async function apiGet(credential, path, params, options = {}) {
    const url = `${API_ORIGIN}${path}${queryString(params)}`;
    let response;
    try {
      response = await flare.http.request({
        url,
        headers: accountHeaders(credential),
        timeoutMillis: options.timeoutMillis ?? 15e3
      });
    } catch {
      throw flare.error({ code: "Network", message: { value: "\u9177\u5B89\u63A5\u53E3\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC" } });
    }
    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      throw flare.error({ code: "InvalidResponse", message: { value: "\u9177\u5B89\u8FD4\u56DE\u4E86\u975E JSON \u5185\u5BB9" } });
    }
    if (response.status === 403 || body.messageStatus === "err_request_captcha_v2") {
      throw flare.error({ code: "Unsupported", message: { value: "\u8BE5\u63A5\u53E3\u9700\u8981\u9A8C\u8BC1\u7801\uFF0C\u533F\u540D\u6D4F\u89C8\u4E0D\u53EF\u7528" } });
    }
    if (response.status === 401) {
      throw flare.error({ code: "AuthenticationRequired", message: { value: "\u9177\u5B89\u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u8BC1" } });
    }
    if (response.status === 429) {
      throw flare.error({ code: "RateLimited", message: { value: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }, retryAfterSeconds: 30 });
    }
    if (response.status < 200 || response.status >= 300) {
      throw flare.error({
        code: "Remote",
        message: { value: body.message || `\u9177\u5B89\u63A5\u53E3\u8FD4\u56DE ${response.status}` }
      });
    }
    return body;
  }
  async function fetchUserFeed(credential, uid, options = {}) {
    const body = await apiGet(credential, "/v6/user/feedList", {
      uid,
      page: options.page ?? 1,
      lastItem: options.cursor ?? void 0,
      isIncludeTop: options.includeTop ? 1 : 0,
      showAnonymous: 0,
      showDoing: 0
    });
    const data = Array.isArray(body.data) ? body.data : [];
    return data.slice(0, options.limit ?? data.length);
  }

  // src/plugin.ts
  var FOLLOW_BATCH = 20;
  var FEED_PER_USER = 12;
  var IMPORT_PAGE_LIMIT = 20;
  var IMPORT_USER_LIMIT = 400;
  var V1_API_HOST = "api.coolapk.com";
  var ANONYMOUS_ACCOUNT_ID = "coolapk-anonymous";
  var DIAGNOSTIC_ACCOUNT_ID = "coolapk-diag";
  var CHECK_TICKS_BEFORE_HINT = 25;
  var checkTicks = 0;
  var followFailures = 0;
  var CAPABILITIES = {
    "flare.datasource.timeline/v1": ["page"],
    // API v1 exposes search only when every declared operation is implemented.
    "flare.datasource.search/v1": false ? ["posts", "profiles"] : ["posts", "profiles", "discoverPosts", "discoverProfiles", "discoverHashtags"],
    "flare.datasource.profile/v1": ["byId", "byHandle", "timeline"],
    "flare.datasource.relation/v1": ["state", "mutate"]
  };
  defineFlareSocialPlugin({
    detector: {
      async detect(request) {
        const host = hostOf(request.origin);
        if (host !== "api.coolapk.com" && host !== "www.coolapk.com") {
          return { match: "none", canonicalOrigin: request.origin };
        }
        const deviceId = await flare.crypto.randomHex(16);
        const credential = { deviceId, users: [] };
        const base = request.origin.replace(/\/$/, "");
        let body;
        try {
          const response = await flare.http.request({
            url: `${base}/v6/main/init`,
            headers: accountHeaders(credential),
            timeoutMillis: 8e3
          });
          if (response.status < 200 || response.status >= 300) {
            return { match: "none", canonicalOrigin: request.origin };
          }
          body = JSON.parse(response.body);
        } catch {
          return { match: "none", canonicalOrigin: request.origin };
        }
        const looksCoolapk = Array.isArray(body.data) || String(body.message ?? "").includes("/v6 not found");
        if (!looksCoolapk) return { match: "none", canonicalOrigin: request.origin };
        return {
          match: "exact",
          canonicalOrigin: request.origin,
          software: "Coolapk",
          instance: { domain: host, title: "\u9177\u5B89" }
        };
      }
    },
    login: {
      guest: {
        async begin(request, context) {
          accountHost(context);
          const requested = (request.values.device ?? "").trim();
          if (requested && !/^[0-9a-fA-F]{16,64}$/.test(requested)) {
            fail("Validation", "\u8BBE\u5907\u6807\u8BC6\u53EA\u80FD\u5305\u542B 16\u201364 \u4F4D\u5341\u516D\u8FDB\u5236\u5B57\u7B26");
          }
          const deviceId = requested ? requested.toLowerCase() : await flare.crypto.randomHex(16);
          const credential = { deviceId, users: [] };
          await apiGet(credential, "/v6/main/init", {}, { timeoutMillis: 15e3 });
          return {
            type: "success",
            value: {
              accountId: ANONYMOUS_ACCOUNT_ID,
              origin: context.origin,
              credential: { ...credential },
              profile: anonymousProfile(context),
              capabilities: CAPABILITIES
            }
          };
        }
      },
      cookieImport: {
        async begin(request, context) {
          accountHost(context);
          const raw = (request.values.cookie ?? "").trim();
          if (!raw) fail("Validation", "\u7F3A\u5C11 Cookie");
          const pairs = parseCookieHeader(raw);
          if (!pairs.length) fail("Validation", "Cookie \u683C\u5F0F\u4E0D\u5BF9\uFF0C\u5E94\u5F62\u5982 uid=1; token=xx; SESSID=xx");
          const credential = {
            deviceId: await flare.crypto.randomHex(16),
            users: []
          };
          const info = await fetchLoginInfo(credential, pairs).catch(() => null);
          if (!info) fail("AuthenticationRequired", "\u8FD9\u6BB5 Cookie \u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u590D\u5236");
          const users = await importFollowing(credential, info.uid, pairs);
          if (!users.length) fail("Validation", "\u6CA1\u6709\u8BFB\u5230\u5173\u6CE8\u5217\u8868\uFF1A\u786E\u8BA4\u8FD9\u4E2A\u8D26\u53F7\u786E\u5B9E\u6709\u5173\u6CE8\uFF0C\u6216\u7A0D\u540E\u91CD\u8BD5");
          let profile;
          try {
            profile = await fetchProfile(credential, info.uid, context, pairs);
          } catch {
            const username = info.username || info.uid;
            profile = {
              key: { id: info.uid, host: accountHost(context) },
              handle: username,
              displayName: username,
              avatarUrl: info.avatar,
              url: `${WEB_ORIGIN}/u/${info.uid}`
            };
          }
          return {
            type: "success",
            value: {
              accountId: info.uid,
              origin: context.origin,
              credential: { deviceId: credential.deviceId, users },
              profile,
              capabilities: CAPABILITIES
            }
          };
        }
      },
      cookie: {
        async begin() {
          checkTicks = 0;
          followFailures = 0;
          return { type: "webCookie", startUrl: LOGIN_URL };
        },
        async check(request, context) {
          accountHost(context);
          const cookies = /* @__PURE__ */ new Map();
          for (const cookie of request.cookies.cookies) cookies.set(cookie.name, cookie.value);
          checkTicks += 1;
          const credential = {
            deviceId: await flare.crypto.randomHex(16),
            users: []
          };
          const giveUp = checkTicks > CHECK_TICKS_BEFORE_HINT;
          const token = cleanCookie(cookies.get("token"));
          const session = cleanCookie(cookies.get("SESSID"));
          if (!session && !token) {
            if (giveUp) {
              return diagnosticSuccess(
                context,
                credential.deviceId,
                cookies.size ? "WebView \u91CC\u8FD8\u6CA1\u767B\u5F55\u6210\u529F" : "WebView \u6CA1\u4EA4 Cookie"
              );
            }
            return { type: "pending" };
          }
          const cookiePairs = [];
          for (const name of ["uid", "username", "token", "validate", "SESSID"]) {
            const value = cleanCookie(cookies.get(name));
            if (value) cookiePairs.push({ name, value });
          }
          const uidFromCookie = cleanCookie(cookies.get("uid"));
          let uid = /^\d+$/.test(uidFromCookie) ? uidFromCookie : "";
          let sessionUser = null;
          if (!uid) {
            let info = null;
            try {
              info = await fetchLoginInfo(credential, cookiePairs);
            } catch {
              info = null;
            }
            if (!info) {
              if (giveUp) return diagnosticSuccess(context, credential.deviceId, "Cookie \u672A\u88AB\u670D\u52A1\u7AEF\u8BA4\u53EF");
              return { type: "pending" };
            }
            uid = info.uid;
            sessionUser = { username: info.username, avatar: info.avatar };
          }
          let users = [];
          let followError = "";
          try {
            users = await importFollowing(credential, uid, cookiePairs);
          } catch (error) {
            followError = errorText(error);
          }
          if (followError) {
            followFailures += 1;
            if (giveUp || followFailures >= 2) {
              return diagnosticSuccess(context, credential.deviceId, followError.slice(0, 28));
            }
            return { type: "pending" };
          }
          if (!users.length) return diagnosticSuccess(context, credential.deviceId, "\u5173\u6CE8\u5217\u8868\u662F\u7A7A\u7684");
          const username = sessionUser?.username || cleanCookie(cookies.get("username")) || uid;
          let profile;
          try {
            profile = await fetchProfile(credential, uid, context, cookiePairs);
          } catch {
            profile = {
              key: { id: uid, host: accountHost(context) },
              handle: username,
              displayName: username,
              avatarUrl: sessionUser?.avatar,
              url: `${WEB_ORIGIN}/u/${uid}`
            };
          }
          return {
            type: "success",
            value: {
              accountId: uid,
              origin: context.origin,
              credential: { deviceId: credential.deviceId, users },
              profile,
              capabilities: CAPABILITIES
            }
          };
        }
      }
    },
    capabilities: {
      timeline: {
        async page(request, context) {
          if (request.timelineId !== "follow") fail("Unsupported", "\u672A\u77E5\u65F6\u95F4\u7EBF");
          const credential = await readCredential();
          const users = credential.users;
          if (!users.length) return { items: [], endReached: true };
          const limit = Math.min(Math.max(request.page.limit || 20, 1), 100);
          const batch = users.slice().sort((left, right) => (left.lastAt ?? 0) - (right.lastAt ?? 0)).slice(0, Math.min(FOLLOW_BATCH, users.length));
          const host = accountHost(context);
          const items = [];
          const seen = /* @__PURE__ */ new Set();
          const fetched = /* @__PURE__ */ new Set();
          let failures = 0;
          for (const user of batch) {
            try {
              const feed = await fetchUserFeed(credential, user.uid, {
                page: 1,
                limit: FEED_PER_USER,
                includeTop: false
              });
              fetched.add(user.uid);
              for (const raw of feed) {
                const item = toTimelineItem(raw, host);
                if (!item || item.type !== "post" || seen.has(item.post.key.id)) continue;
                seen.add(item.post.key.id);
                items.push(item);
              }
            } catch {
              failures++;
            }
          }
          if (failures === batch.length) fail("Network", "\u9177\u5B89\u52A8\u6001\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
          const now = Date.now();
          for (const user of users) {
            if (fetched.has(user.uid)) user.lastAt = now;
          }
          await flare.credential.replace({ ...credential }).catch(() => false);
          items.sort(compareCreatedAt);
          return { items: items.slice(0, limit), endReached: true };
        }
      },
      search: {
        posts: searchPosts,
        profiles: searchProfiles,
        // 酷安没有独立的「发现」流，API v1 又强制声明这三个操作：直接复用搜索结果。
        discoverPosts: searchPosts,
        discoverProfiles: searchProfiles,
        async discoverHashtags() {
          return { items: [], endReached: true };
        }
      },
      profile: {
        async byId(request, context) {
          if (request.key.id === ANONYMOUS_ACCOUNT_ID || request.key.id === DIAGNOSTIC_ACCOUNT_ID) {
            const stored = await flare.credential.read().catch(() => null);
            const note = isCredential(stored) ? stored.note : void 0;
            return note ? diagnosticProfile(context, note) : anonymousProfile(context);
          }
          const credential = await readCredential();
          return fetchProfile(credential, request.key.id, context);
        },
        async byHandle(request, context) {
          const credential = await readCredential();
          const handle = request.handle.replace(/^@/, "").trim();
          if (!handle) fail("Validation", "\u7F3A\u5C11\u7528\u6237\u540D");
          if (handle === "coolapk" || handle === "\u9177\u5B89\u533F\u540D") return anonymousProfile(context);
          const body = await apiGet(credential, "/v6/search", { type: "user", searchValue: handle, page: 1 });
          const match = asArray(body.data).find(
            (raw) => String(raw.username ?? "").toLowerCase() === handle.toLowerCase()
          );
          if (!match) fail("NotFound", `\u6CA1\u6709\u627E\u5230\u7528\u6237 ${handle}`);
          return mapProfile(match, accountHost(context));
        },
        async timeline(request, context) {
          if (request.page.direction !== "refresh" && request.page.cursor) {
            return { items: [], endReached: true };
          }
          const credential = await readCredential();
          const host = accountHost(context);
          const feed = await fetchUserFeed(credential, request.profile.id, {
            page: 1,
            limit: Math.min(request.page.limit || 20, 30),
            includeTop: true
          });
          const items = [];
          for (const raw of feed) {
            const item = toTimelineItem(raw, host);
            if (item) items.push(item);
          }
          return { items, endReached: true };
        }
      },
      relation: {
        async state(request, context) {
          const credential = await readCredential();
          return {
            profileKey: { id: request.key.id, host: accountHost(context) },
            following: credential.users.some((user) => user.uid === request.key.id)
          };
        },
        async mutate(request, context) {
          const credential = await readCredential();
          const uid = request.key.id;
          const exists = credential.users.some((user) => user.uid === uid);
          if (request.action === "Follow") {
            if (!exists) {
              const token = parseActionToken(request.actionToken);
              let username = token?.username ?? "";
              let avatar = token?.avatar;
              if (!username) {
                try {
                  const profile = await fetchProfile(credential, uid, context);
                  username = profile.handle;
                  avatar = profile.avatarUrl;
                } catch {
                  username = uid;
                }
              }
              credential.users.push({ uid, username, avatar, lastAt: 0 });
              await flare.credential.replace({ ...credential });
            }
            return {
              type: "updatedRelation",
              relation: { profileKey: { id: uid, host: accountHost(context) }, following: true }
            };
          }
          if (request.action === "Unfollow") {
            if (exists) {
              credential.users = credential.users.filter((user) => user.uid !== uid);
              await flare.credential.replace({ ...credential });
            }
            return {
              type: "updatedRelation",
              relation: { profileKey: { id: uid, host: accountHost(context) }, following: false }
            };
          }
          fail("Unsupported", "\u53EA\u652F\u6301\u672C\u5730\u5173\u6CE8\u4E0E\u53D6\u6D88\u5173\u6CE8");
        }
      }
    }
  });
  async function searchPosts(request, context) {
    const keyword = request.query.trim();
    if (!keyword) return { items: [], endReached: true };
    const credential = await readCredential();
    const page = pageNumber(request.page.cursor);
    const body = await apiGet(credential, "/v6/search", {
      type: "feed",
      searchValue: keyword,
      page,
      showAnonymous: -1
    });
    const host = accountHost(context);
    const items = [];
    for (const raw of asArray(body.data)) {
      const item = toTimelineItem(raw, host);
      if (item) items.push(item);
    }
    return {
      items,
      olderCursor: items.length ? String(page + 1) : void 0,
      endReached: !items.length
    };
  }
  async function searchProfiles(request, context) {
    const keyword = request.query.trim();
    if (!keyword) return { items: [], endReached: true };
    const credential = await readCredential();
    const page = pageNumber(request.page.cursor);
    const body = await apiGet(credential, "/v6/search", {
      type: "user",
      searchValue: keyword,
      page
    });
    const host = accountHost(context);
    const items = asArray(body.data).map((raw) => mapProfile(raw, host)).filter((profile) => profile.key.id !== "");
    return {
      items,
      olderCursor: items.length ? String(page + 1) : void 0,
      endReached: !items.length
    };
  }
  function isCredential(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const credential = value;
    return typeof credential.deviceId === "string" && credential.deviceId.length > 0 && Array.isArray(credential.users);
  }
  async function readCredential() {
    const value = await flare.credential.read();
    if (!isCredential(value)) fail("AuthenticationRequired", "\u533F\u540D\u8EAB\u4EFD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u6DFB\u52A0\u9177\u5B89\u8D26\u53F7");
    const users = [];
    const rawUsers = value.users;
    for (const raw of rawUsers) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw;
      const uid = String(entry.uid ?? "");
      if (!uid) continue;
      users.push({
        uid,
        username: String(entry.username ?? uid),
        avatar: typeof entry.avatar === "string" ? entry.avatar : void 0,
        lastAt: typeof entry.lastAt === "number" ? entry.lastAt : 0
      });
    }
    return { deviceId: value.deviceId, users };
  }
  async function fetchLoginInfo(credential, cookiePairs) {
    const body = await apiGetWithCookies(credential, "/v6/account/checkLoginInfo", {}, cookiePairs);
    const data = body.data ?? null;
    if (!data) return null;
    const uid = String(data.uid ?? "").trim();
    if (!/^\d+$/.test(uid)) return null;
    return {
      uid,
      username: String(data.username ?? "").trim() || void 0,
      avatar: toHttps(String(data.userAvatar ?? ""))
    };
  }
  function anonymousProfile(context, note) {
    return {
      key: { id: ANONYMOUS_ACCOUNT_ID, host: accountHost(context) },
      handle: "coolapk",
      displayName: note ? `\u9177\u5B89\uFF5C${note}` : "\u9177\u5B89\u533F\u540D",
      description: { format: "plain", value: "\u53EA\u8BFB\u6D4F\u89C8\uFF1A\u4E0D\u767B\u5F55\uFF0C\u5173\u6CE8\u540D\u5355\u4FDD\u5B58\u5728\u672C\u5730" }
    };
  }
  async function readExistingUsers() {
    try {
      const value = await flare.credential.read();
      if (isCredential(value)) return value.users;
    } catch {
    }
    return [];
  }
  async function diagnosticSuccess(context, deviceId, note) {
    const users = await readExistingUsers();
    return {
      type: "success",
      value: {
        accountId: DIAGNOSTIC_ACCOUNT_ID,
        origin: context.origin,
        credential: { deviceId, users, note },
        profile: diagnosticProfile(context, note),
        capabilities: CAPABILITIES
      }
    };
  }
  function diagnosticProfile(context, note) {
    return {
      key: { id: DIAGNOSTIC_ACCOUNT_ID, host: accountHost(context) },
      handle: "coolapk",
      displayName: `\u9177\u5B89\uFF5C${note}`,
      description: { format: "plain", value: note }
    };
  }
  async function importFollowing(credential, uid, cookiePairs) {
    const users = [];
    const seen = /* @__PURE__ */ new Set();
    let lastItem;
    for (let page = 1; page <= IMPORT_PAGE_LIMIT; page++) {
      const body = await followListPage(credential, uid, page, lastItem, cookiePairs);
      const rows = asArray(body.data);
      if (!rows.length) break;
      const tail = rows[rows.length - 1];
      const nextLastItem = String(tail?.id ?? "").trim();
      if (!nextLastItem || nextLastItem === lastItem) break;
      lastItem = nextLastItem;
      for (const raw of rows) {
        const entry = raw;
        const id = String(entry.uid ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        users.push({
          uid: id,
          username: String(entry.username ?? id),
          avatar: toHttps(String(entry.userAvatar ?? entry.avatar ?? "")),
          lastAt: 0
        });
        if (users.length >= IMPORT_USER_LIMIT) return users;
      }
    }
    return users;
  }
  async function followListPage(credential, uid, page, lastItem, cookiePairs) {
    const attempts = [
      { uid, page, lastItem },
      { uid, page }
    ];
    if (page === 1) attempts.push({ page });
    let last = null;
    for (const params of attempts) {
      try {
        return await apiGetWithCookies(credential, "/v6/user/followList", params, cookiePairs);
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }
  async function apiGetWithCookies(credential, path, params, cookiePairs) {
    const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
    const url = `${API_ORIGIN}${path}?${query}`;
    let response;
    try {
      response = await flare.http.request({
        url,
        headers: accountHeaders(credential),
        cookies: cookiePairs,
        timeoutMillis: 15e3
      });
    } catch {
      fail("Network", "\u9177\u5B89\u63A5\u53E3\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
    }
    if (response.status === 403) {
      const captcha = String(response.body ?? "").includes("captcha") ? "\u5173\u6CE8\u9700\u9A8C\u8BC1\u7801" : "\u5173\u6CE8\u88AB\u62D2403";
      fail("Unsupported", captcha);
    }
    if (response.status < 200 || response.status >= 300) {
      fail("Remote", `\u5173\u6CE8\u63A5\u53E3${response.status}`);
    }
    try {
      return JSON.parse(response.body);
    } catch {
      fail("InvalidResponse", "\u9177\u5B89\u8FD4\u56DE\u4E86\u975E JSON \u5185\u5BB9");
    }
  }
  async function fetchProfile(credential, uid, context, cookiePairs) {
    const body = cookiePairs ? await apiGetWithCookies(credential, "/v6/user/space", { uid }, cookiePairs) : await apiGet(credential, "/v6/user/space", { uid });
    const raw = body.data ?? {};
    if (!raw || typeof raw !== "object" || !raw.uid) fail("NotFound", "\u9177\u5B89\u7528\u6237\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5C01\u7981");
    return mapProfile(raw, accountHost(context));
  }
  function mapProfile(raw, host) {
    const uid = String(raw.uid ?? "");
    const username = String(raw.displayUsername ?? raw.username ?? uid);
    const bio = String(raw.bio ?? "").trim();
    const verify = String(raw.verify_title ?? "").trim();
    return {
      key: { id: uid, host },
      handle: username || uid,
      displayName: username || uid,
      avatarUrl: toHttps(String(raw.userAvatar ?? raw.avatar ?? "")),
      bannerUrl: toHttps(String(raw.cover ?? "")),
      description: bio ? { format: "plain", value: bio } : void 0,
      url: `${WEB_ORIGIN}/u/${uid}`,
      followersCount: numberOrUndefined(raw.fans),
      followingCount: numberOrUndefined(raw.follow),
      postsCount: numberOrUndefined(raw.feed),
      fields: verify ? [{ name: "\u8BA4\u8BC1", value: { format: "plain", value: verify } }] : void 0
    };
  }
  function mapPost(raw, host) {
    const id = String(raw.id ?? "");
    if (!id) return null;
    const uid = String(raw.uid ?? "");
    const username = String(raw.username ?? "");
    const message = String(raw.message ?? "").trim();
    const media = mapMedia(raw, id);
    const topicTitle = String(raw.ttitle ?? "").trim();
    const topicUrl = String(raw.turl ?? "").trim();
    return {
      key: { id, host },
      author: {
        key: { id: uid, host },
        handle: username || uid,
        displayName: username || uid,
        avatarUrl: toHttps(String(raw.userAvatar ?? "")),
        url: `${WEB_ORIGIN}/u/${uid}`
      },
      createdAt: toDate(raw.dateline),
      content: message ? { format: "html", value: message } : { format: "plain", value: media.length ? "\uFF08\u65E0\u6B63\u6587\uFF09" : "\uFF08\u7A7A\u52A8\u6001\uFF09" },
      media: media.length ? media : void 0,
      url: `${WEB_ORIGIN}/feed/${id}`,
      // 详情/回复接口需要验证码，这里统一跳到网页版阅读。
      detailType: "link",
      favouritesCount: numberOrUndefined(raw.likenum),
      repliesCount: numberOrUndefined(raw.replynum),
      repostsCount: numberOrUndefined(raw.forwardnum),
      sourceChannel: topicTitle ? { id: topicUrl || `topic-${String(raw.tid ?? "")}`, name: topicTitle } : void 0
    };
  }
  function toTimelineItem(raw, host) {
    const post = mapPost(raw, host);
    if (!post) return null;
    const source = raw.sourceFeed;
    if (source && typeof source === "object" && source.id) {
      const quoted = mapPost(source, host);
      if (quoted) return { type: "post", post, presentation: { repost: quoted } };
    }
    return { type: "post", post };
  }
  function mediaUrl(url) {
    const https = toHttps(url);
    if (!https) return;
    return "https://wsrv.nl/?url=" ? `${"https://wsrv.nl/?url="}${encodeURIComponent(https)}` : https;
  }
  function mediaHeaders() {
    return false ? { "User-Agent": MEDIA_USER_AGENT } : void 0;
  }
  function mapMedia(raw, postId) {
    const media = [];
    const headerPart = mediaHeaders() ? { customHeaders: mediaHeaders() } : {};
    const videoUrl = mediaUrl(String(raw.media_url ?? ""));
    if (Number(raw.media_type) === 2 && videoUrl) {
      media.push({
        id: `${postId}-video`,
        type: "video",
        url: videoUrl,
        previewUrl: mediaUrl(String(raw.media_pic ?? "")),
        ...headerPart
      });
    }
    const pictures = [];
    for (const entry of asArray(raw.picArr)) {
      if (typeof entry === "string" && entry) pictures.push(entry);
    }
    if (!pictures.length) {
      const single = String(raw.pic ?? "").trim();
      if (single) pictures.push(...single.split(",").map((part) => part.trim()).filter(Boolean));
    }
    pictures.slice(0, 9).forEach((url, index) => {
      const proxied = mediaUrl(url);
      if (!proxied) return;
      media.push({
        id: `${postId}-${index}`,
        type: "image",
        url: proxied,
        ...headerPart
      });
    });
    return media;
  }
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function toHttps(url) {
    const trimmed = url.trim();
    if (!trimmed) return void 0;
    const absolute = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    if (absolute.startsWith("http://")) return `https://${absolute.slice("http://".length)}`;
    return absolute.startsWith("https://") ? absolute : void 0;
  }
  function numberOrUndefined(value) {
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function toDate(value) {
    const seconds = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return (/* @__PURE__ */ new Date()).toISOString();
    return new Date(seconds * 1e3).toISOString();
  }
  function pageNumber(cursor) {
    const parsed = Number.parseInt(cursor ?? "1", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }
  function compareCreatedAt(left, right) {
    const leftTime = left.type === "post" ? left.post.createdAt : "";
    const rightTime = right.type === "post" ? right.post.createdAt : "";
    return rightTime.localeCompare(leftTime);
  }
  function parseCookieHeader(raw) {
    const pairs = [];
    for (const part of raw.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      const name = trimmed.slice(0, index).trim();
      const value = cleanCookie(trimmed.slice(index + 1));
      if (name && value) pairs.push({ name, value });
    }
    return pairs;
  }
  function cleanCookie(value) {
    if (!value) return "";
    const stripped = value.trim().replace(/^"|"$/g, "");
    if (!stripped || /^deleted$/i.test(stripped)) return "";
    try {
      return decodeURIComponent(stripped);
    } catch {
      return stripped;
    }
  }
  function hostOf(origin) {
    return origin.replace(/^https:\/\//, "").replace(/\/.*$/, "");
  }
  function accountHost(context) {
    const host = context.origin.replace(/^https:\/\//, "").replace(/\/.*$/, "");
    if (host !== V1_API_HOST) {
      fail("Validation", `\u5B9E\u4F8B\u5730\u5740\u8BF7\u586B ${V1_API_HOST}\uFF08\u5F53\u524D\u7248\u672C\u53EA\u5141\u8BB8\u63D2\u4EF6\u8BBF\u95EE\u8FD9\u4E00\u4E2A\u57DF\u540D\uFF09`);
    }
    return host;
  }
  function parseActionToken(token) {
    if (!token) return null;
    try {
      const value = JSON.parse(token);
      return {
        username: typeof value.username === "string" ? value.username : void 0,
        avatar: typeof value.avatar === "string" ? value.avatar : void 0
      };
    } catch {
      return null;
    }
  }
  function errorText(error) {
    const value = error;
    const nested = value?.pluginError?.message?.value;
    if (typeof nested === "string" && nested) return nested;
    const message = value?.message;
    if (typeof message === "string" && message) return message;
    if (message && typeof message === "object" && typeof message.value === "string") {
      return message.value;
    }
    return "\u5173\u6CE8\u5217\u8868\u8BFB\u53D6\u5931\u8D25";
  }
  function fail(code, message) {
    throw flare.error({ code, message: { value: message } });
  }
})();
