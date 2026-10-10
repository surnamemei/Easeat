<view class="container log-list">
  <view class='add-class'>
    <button type="default" bindtap="confirmCreateClass">创建班级</button>
    <button type="default" bindtap="confirmJoinClass">加入班级</button>
  </view>
    <button class='tt' bindtap="notice">公告（必看）</button>
  <text>\n</text>
  <block qq:for="{{classes}}" qq:for-item="c" qq:key="{{id}}">
    <view class="class-item" qq:if="{{c.owned}}">
      <view data-classid="{{c.id}}" data-owned="{{c.owned}}" bindtap="nevigate2Class" class="class-name">
        <text>{{index + 1}}. {{c.name}}</text>
      </view>
      <button bindtap="deleteClass" data-classid="{{c.id}}" class="delete-button">删除</button>
    </view>
    <view class="class-item" qq:else>
      <view data-classid="{{c.id}}" data-owned="{{c.owned}}" bindtap="nevigate2Class" class="class-name">
        <text>{{index + 1}}. {{c.name}}</text>
      </view>
      <button bindtap="quitClass" data-classid="{{c.id}}" class="delete-button">退出</button>
    </view>
  </block>
</view>

<block qq:if="{{showConfirm}}">
  <view class='toast-box'>
    <view class='toastbg'></view>
    <view class='showToast'>
      <view class='toast-title'>
        <text>{{confirmTittle}}</text>
      </view>
      <view class='toast-main'>
        <view class='toast-input'>
          <input focus placeholder='{{confirmPlaceHolder}}' bindinput='setValue'></input>
        </view>
      </view>
      <view class='toast-button'>
        <view class='button1'>
          <button bindtap='cancel'>取消</button>
        </view>
        <view class='button2'>
          <button catchtap='confirmAcceptance'>确定</button>
        </view>
      </view>
    </view>
  </view>
</block>