/**
 * 中文(简体)名言种子。
 *
 * 选材原则:
 *  - 全球公认的声音(斯多葛、爱因斯坦、居里夫人、乔布斯等)
 *  - 中华文化圈的代表人物:孔子、老子、庄子、孟子、苏轼、王阳明、鲁迅、林语堂、胡适、钱学森。
 *  - 中文为最常引用、可考证的版本;避开常见的误传与改写。
 */
import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";

export const FAMOUS_QUOTES_SEED_ZH: ReadonlyArray<FamousQuoteSeed> = [
  // 全球哲学
  {
    id: "zh_aurelius_obstacle",
    text: "阻碍行动之物,反而成全行动。横在路上的,正成为路本身。",
    author: "马可·奥勒留",
    category: "philosophy",
    language: "ko", // 시드 type 호환을 위함; 실제 분기는 famousQuoteCatalog 에서.
  },
  {
    id: "zh_seneca_time",
    text: "并非我们生命短暂,而是我们浪费了太多。",
    author: "塞涅卡",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_socrates_examined",
    text: "未经审视的人生不值得过。",
    author: "苏格拉底",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_einstein_imagination",
    text: "想象力比知识更重要。",
    author: "阿尔伯特·爱因斯坦",
    category: "scientist",
    language: "ko",
  },
  {
    id: "zh_curie_understand",
    text: "生活中没有什么可怕的事,只有需要去理解的事。",
    author: "玛丽·居里",
    category: "scientist",
    language: "ko",
  },
  {
    id: "zh_jobs_time",
    text: "你的时间有限,所以不要浪费时间去活成别人的人生。",
    author: "史蒂夫·乔布斯",
    category: "entrepreneur",
    language: "ko",
  },
  {
    id: "zh_mandela_impossible",
    text: "事情往往看似不可能,直到它被完成。",
    author: "纳尔逊·曼德拉",
    category: "leader",
    language: "ko",
  },

  // 中华文化圈
  {
    id: "zh_confucius_three",
    text: "三人行,必有我师焉。择其善者而从之,其不善者而改之。",
    author: "孔子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_confucius_xueshi",
    text: "学而时习之,不亦说乎?",
    author: "孔子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_confucius_jizijili",
    text: "己所不欲,勿施于人。",
    author: "孔子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_laozi_step",
    text: "千里之行,始于足下。",
    author: "老子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_laozi_water",
    text: "上善若水,水善利万物而不争。",
    author: "老子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_laozi_zhiren",
    text: "知人者智,自知者明。",
    author: "老子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_zhuangzi_useful",
    text: "人皆知有用之用,而莫知无用之用也。",
    author: "庄子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_mencius_tian",
    text: "天将降大任于斯人也,必先苦其心志,劳其筋骨。",
    author: "孟子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_mencius_zide",
    text: "得道者多助,失道者寡助。",
    author: "孟子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_xunzi_qing",
    text: "不积跬步,无以至千里;不积小流,无以成江海。",
    author: "荀子",
    category: "philosophy",
    language: "ko",
  },
  {
    id: "zh_wangyangming_zhixing",
    text: "知是行之始,行是知之成。",
    author: "王阳明",
    category: "philosophy",
    language: "ko",
  },

  // 文学 / 思想
  {
    id: "zh_sushi_yibei",
    text: "回首向来萧瑟处,归去,也无风雨也无晴。",
    author: "苏轼",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_sushi_renyou",
    text: "人有悲欢离合,月有阴晴圆缺,此事古难全。",
    author: "苏轼",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_libai_changfeng",
    text: "长风破浪会有时,直挂云帆济沧海。",
    author: "李白",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_dufu_huiding",
    text: "会当凌绝顶,一览众山小。",
    author: "杜甫",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_luxun_road",
    text: "其实地上本没有路,走的人多了,也便成了路。",
    author: "鲁迅",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_hushi_da",
    text: "怕什么真理无穷,进一寸有一寸的欢喜。",
    author: "胡适",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_lin_yutang_simple",
    text: "智慧的实质就是要发挥简单生活的趣味。",
    author: "林语堂",
    category: "literature",
    language: "ko",
  },
  {
    id: "zh_qian_xuesen_keji",
    text: "我作为一名中国的科技工作者,活着的目的就是为人民服务。",
    author: "钱学森",
    category: "scientist",
    language: "ko",
  },
];
