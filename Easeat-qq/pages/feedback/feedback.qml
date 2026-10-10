<view class="page">
  <view class="card">
    <view class="card-title">意见反馈</view>
    <view class="hint intro">遇到问题、想要新功能，都欢迎告诉我们。反馈时写上班级 ID 和出问题的步骤，能帮我们更快找到原因。</view>
    <button class="btn primary" hover-class="btn-hover" open-type="feedback">在小程序内反馈</button>
    <button qq:if="{{isQQ && qqGroupId}}" class="btn light group" hover-class="btn-hover" open-type="openGroupProfile" group-id="{{qqGroupId}}">加入 QQ 交流群</button>
    <view class="email">
      <view class="email-main">
        <view class="muted">反馈邮箱</view>
        <view class="email-text">{{email}}</view>
      </view>
      <view class="btn small light" hover-class="btn-hover" bindtap="copyEmail">复制</view>
    </view>
  </view>
</view>
