/**
 * 带一个输入框的对话框。由页面用 wx:if 控制显示，每次显示都会重新创建：
 * <input-dialog wx:if="{{dialog}}" title="创建班级" placeholder="班级名称" bindconfirm="..." bindcancel="..." />
 * 点确定时触发 confirm 事件，e.detail.value 为去掉首尾空格后的输入内容。
 */
Component({
  properties: {
    title: { type: String, value: '' },
    hint: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    value: { type: String, value: '' },
    maxlength: { type: Number, value: 20 },
    confirmText: { type: String, value: '确定' },
  },

  data: {
    text: '',
    focus: false,
  },

  attached() {
    this.setData({ text: this.data.value || '', focus: true });
  },

  methods: {
    onInput(e) {
      this.setData({ text: e.detail.value });
    },
    cancel() {
      this.triggerEvent('cancel');
    },
    confirm() {
      this.triggerEvent('confirm', { value: String(this.data.text || '').trim() });
    },
    noop() {},
  },
});
