<view class="page">
  <view qq:for="{{notes}}" qq:key="version" class="card">
    <view class="card-header">
      <view class="card-title">易位 {{item.version}}</view>
      <view class="card-extra">{{item.date}}</view>
    </view>
    <view class="card-body">
      <view qq:for="{{item.items}}" qq:for-item="line" qq:key="*this" class="note">
        <view class="dot"></view>
        <view class="note-text">{{line}}</view>
      </view>
    </view>
  </view>
  <view class="btn light" hover-class="btn-hover" bindtap="openTutorial">查看使用教程</view>
</view>
