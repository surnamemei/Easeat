
<view class="container log-list">
<view class='ty'>视频教程</view>
<view class='add-class'>
    <button  bindtap="showbilibili">跳转至B站</button>
    <button  bindtap="showtiktok">跳转至抖音</button>
  </view>

<block wx:if="{{bilibili}}">
<web-view src="https://www.bilibili.com/video/BV1GJ411x7h7?spm_id_from=333.337.search-card.all.click"/> 
</block>
<block wx:if="{{tiktok}}">
<web-view src="https://www.bilibili.com/video/BV1GJ411x7h7?spm_id_from=333.337.search-card.all.click"/> 
</block>

<view class='ty'>文字教程</view>

   <view class="function-block">
      <view bindtap="switch" data-key="show1" class="block-title">
         <view class="block-title-text">温馨提示</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showNameList?0:-90}}deg);" class="icon"></image>
         </view>
      </view>
      <text qq:if="{{show1}}">
      1.	目前小程序支持QQ、WX、TIM平台，但是WX和QQ、TIM的数据不互通。
      2.	目前仅QQ全平台，TIM苹果端可享受程序全部内容;而TIM安卓端由于版本兼容性的问题，暂不支持上传文件的功能，敬请谅解。
      </text>
    </view>

   <view class="function-block">
      <view bindtap="switch" data-key="show2" class="block-title">
         <view class="block-title-text">创建/加入班级</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showNameList?0:-90}}deg);" class="icon"></image>
         </view>
      </view>
      <text qq:if="{{show2}}">
      设计座位表
1.	在首页一栏中，点击屏幕上方的创建班级按钮。
2.	在弹出的弹窗中输入自拟的班级名，然后点击确认键。
3.	点击已生成的班级，进入班级页面。
4.	点击编辑座位分区，根据教室大小进行更改座位的行数与列数，并选定需要排座位的格子，（蓝色为选择，白色为空白）点击保存座位完成设置。
5.	点击学生名单分区，这里有两种选择可以导入学生信息。第一种是手动输入，一次添加一个学生的姓名及其身高，第二种是按格式要求导入Excel表格。（表格需空出第一行，第一列姓名【必需】，第二列身高）
6.	点击重排座位按钮，即可预览新生成的座位表。
7.	如果想要修改某一单元格的数据，点击并在弹窗中修改成想要的数据。
8.	点击确定，重新进入班级页面即可。
      加入班级
1.	在首页一栏中，点击屏幕上方的加入班级按钮。
2.	在弹出的弹窗中输入他人给予的班级id。
3.	点击确认键，即可预览当前座位表。
      </text>
    </view>

       <view class="function-block">
      <view bindtap="switch" data-key="show3" class="block-title">
         <view class="block-title-text">分享与下载</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showNameList?0:-90}}deg);" class="icon"></image>
         </view>
      </view>
      <text qq:if="{{show3}}">
分享座位表：在班级页面中点击分享分区，然后你会看到班级id，点击右边的复制按钮，即可分享给好友。
分享小程序：点击左上角‘···’键，点击‘分享给好友’即可。
***下载预览表格：
1.	在班级页面中点击分享分区，然后你会看到座位排布数据，点击右边的复制按钮。
2.	在电脑上新建一个空白表格文档，在任意单元格中粘贴信息。
3.	选中当前单元格，在工具栏中寻找‘数据’分栏，点击‘分列’功能。
4.	如使用Excel，请依次选择：分隔符号——逗号——常规；如使用WPS，点击‘逗号’即可。
5.	修改并保存文件，座位表就导出成功了。
      </text>
    </view>

<view class="function-block">
      <view bindtap="switch" data-key="show4" class="block-title">
         <view class="block-title-text">其他</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showNameList?0:-90}}deg);" class="icon"></image>
         </view>
      </view>
      <text qq:if="{{show4}}">
投诉与反馈：
点击右上角‘···’按钮，在最下面一行往右翻，即可看到‘反馈’/‘举报’按钮。
添加到桌面：
点击右上方‘···’按钮，在最下面一行可以看到‘添加到桌面’的按钮，点击即设置成功。如果桌面并没有显示，按弹窗提示去更改设置即可。
      </text>
    </view>
</view>