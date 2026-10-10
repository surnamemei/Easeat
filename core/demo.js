/** 示例班级：第一次使用时可以直接体验全部功能 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EaseatDemo = factory();
})(this, function () {
  const SURNAMES = '张李王刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕';
  const GIVEN = ['子涵', '欣怡', '梓轩', '浩然', '雨桐', '宇航', '思琪', '一诺', '俊杰', '佳怡', '博文', '语嫣', '晨曦', '天佑', '嘉怡', '明轩', '诗涵', '皓轩', '若曦', '子墨', '昊天', '雅琪', '梓萱', '睿', '涵', '泽宇', '可馨', '子豪', '静怡', '奕辰', '心怡', '铭', '沐阳', '欣然', '嘉豪', '紫萱', '宇', '思远', '梦琪', '安琪'];

  const NAME = '示例班级';
  /** 40 名学生，每行“姓名 身高” */
  const ROSTER = GIVEN.map((g, i) => `${SURNAMES[i % SURNAMES.length]}${g} ${148 + ((i * 37) % 30)}`).join('\n');

  return { NAME, ROSTER };
});
