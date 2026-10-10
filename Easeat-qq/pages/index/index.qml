<view class="page">
  <view class="hero">
    <image class="hero-logo" src="/images/logo.svg" mode="aspectFill" />
    <view>
      <view class="hero-title">易位 eaSEAT</view>
      <view class="hero-sub">一键排座位 · 每周自动轮换</view>
    </view>
  </view>

  <view qq:if="{{showNotice}}" class="notice" hover-class="btn-hover" bindtap="openNotice">
    <view class="notice-badge">新</view>
    <view class="notice-text">易位 2.0：大组轮换、不相邻名单、每周自动重排</view>
    <view class="list-arrow"></view>
  </view>

  <view class="actions">
    <view class="action" hover-class="btn-hover" bindtap="showCreate">
      <view class="action-icon">＋</view>
      <view class="action-title">创建班级</view>
      <view class="action-sub">老师排座位</view>
    </view>
    <view class="action" hover-class="btn-hover" bindtap="showJoin">
      <view class="action-icon join">→</view>
      <view class="action-title">加入班级</view>
      <view class="action-sub">学生、家长查看座位</view>
    </view>
  </view>

  <block qq:if="{{loaded}}">
    <view qq:if="{{owned.length}}" class="section-title">我创建的班级</view>
    <view
      qq:for="{{owned}}"
      qq:key="id"
      class="class-item"
      hover-class="list-hover"
      data-id="{{item.id}}"
      bindtap="openClass"
    >
      <view class="class-main">
        <view class="class-name">{{item.name}}</view>
        <view class="class-id">ID：{{item.id}}</view>
      </view>
      <view class="class-op" hover-class="btn-hover" data-id="{{item.id}}" data-name="{{item.name}}" catchtap="deleteClass">删除</view>
    </view>

    <view qq:if="{{joined.length}}" class="section-title">我加入的班级</view>
    <view
      qq:for="{{joined}}"
      qq:key="id"
      class="class-item"
      hover-class="list-hover"
      data-id="{{item.id}}"
      bindtap="openClass"
    >
      <view class="class-main">
        <view class="class-name">{{item.name}}</view>
        <view class="class-id">ID：{{item.id}}</view>
      </view>
      <view class="class-op" hover-class="btn-hover" data-id="{{item.id}}" data-name="{{item.name}}" catchtap="quitClass">退出</view>
    </view>

    <view qq:if="{{!owned.length && !joined.length}}" class="empty">
      <image class="empty-image" src="/images/no_data.png" />
      <text class="empty-text">还没有班级。\n老师请先创建班级；学生和家长请向老师要班级 ID，\n或直接点开老师分享的班级卡片。</text>
    </view>
  </block>
</view>

<input-dialog
  qq:if="{{dialog}}"
  title="{{dialog.title}}"
  hint="{{dialog.hint}}"
  placeholder="{{dialog.placeholder}}"
  maxlength="{{dialog.maxlength}}"
  confirmText="{{dialog.confirmText}}"
  bindconfirm="onDialogConfirm"
  bindcancel="closeDialog"
/>
