<view class="page">
  <view qq:for="{{sections}}" qq:key="key" class="card">
    <view class="card-header" data-index="{{index}}" bindtap="toggle">
      <view class="card-title">{{item.title}}</view>
      <image class="chevron {{item.open ? '' : 'closed'}}" src="/images/drop_down.svg" />
    </view>
    <view qq:if="{{item.open}}" class="card-body">
      <view qq:for="{{item.steps}}" qq:for-item="step" qq:for-index="n" qq:key="*this" class="step">
        <view class="step-no">{{n + 1}}</view>
        <view class="step-text">{{step}}</view>
      </view>
    </view>
  </view>
</view>
