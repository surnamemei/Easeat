<view class="page">
  <view class="brand">
    <image class="brand-logo" src="/images/logo.svg" />
    <view class="brand-name">易位 eaSEAT</view>
    <view class="muted">版本 2.0</view>
  </view>

  <view class="card">
    <view class="para">易位是一个帮老师排座位的小程序。老师录入学生名单、画好教室布局后，一键就能按身高或随机排好座位；也可以每周让各大组整体轮换，或指定某些同学不坐在一起。座位表可以生成图片、导出 Excel，或用网页链接发给学生和家长。</view>
  </view>

  <view class="card">
    <view class="card-title">作者</view>
    <view class="para">易位最初是武汉英中高级中学学生的作品：</view>
    <view class="credit"><text class="credit-name">Wenbo Zhang</text><text class="muted">开发了 QQ 小程序原版</text></view>
    <view class="credit"><text class="credit-name">surnamemei</text><text class="muted">移植到微信，并负责后续维护</text></view>
    <view class="para small">1.0 原版的代码保存在 GitHub 的 Releases 中。</view>
  </view>

  <view class="card">
    <view class="card-title">隐私说明</view>
    <view class="para">易位只保存排座需要的信息：班级名称、学生姓名和身高。{{local ? '现在所有数据都只保存在这台设备上，不会上传。' : '只有班级的创建者能看到名单和身高，加入班级的人只能看到座位表。'}}导入的 Excel 名单在手机上读取，不会上传。删除班级时，相关数据会一并删除。</view>
  </view>

  <view class="card">
    <view class="card-title">网页版</view>
    <view class="para">电脑和平板可以使用网页版，功能和小程序一样，可以导入小程序的备份。</view>
    <view class="repo">
      <text class="repo-text">{{site}}</text>
      <view class="btn small light" hover-class="btn-hover" bindtap="copySite">复制</view>
    </view>
  </view>

  <view class="card">
    <view class="card-title">开放源代码</view>
    <view class="para">易位的源代码公开在 GitHub 上，欢迎查看和参与改进。</view>
    <view class="repo">
      <text class="repo-text">{{repo}}</text>
      <view class="btn small light" hover-class="btn-hover" bindtap="copyRepo">复制</view>
    </view>
  </view>
</view>
