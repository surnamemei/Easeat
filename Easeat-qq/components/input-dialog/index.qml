<view class="mask" catchtouchmove="noop">
  <view class="dialog">
    <view class="title">{{title}}</view>
    <view qq:if="{{hint}}" class="hint">{{hint}}</view>
    <input
      class="field"
      value="{{text}}"
      placeholder="{{placeholder}}"
      placeholder-class="placeholder"
      maxlength="{{maxlength}}"
      focus="{{focus}}"
      confirm-type="done"
      bindinput="onInput"
      bindconfirm="confirm"
    />
    <view class="actions">
      <view class="action" hover-class="action-hover" bindtap="cancel">取消</view>
      <view class="action primary" hover-class="action-hover" bindtap="confirm">{{confirmText}}</view>
    </view>
  </view>
</view>
