<view class="page">

   <view class="function-block">
      <view bindtap="switch" data-key="showArrangement" class="block-title">
         <view class="block-title-text">当前座位表</view>
         <view class="block-title-symbol">
            <!-- {{showArrangement?"V":">"}} -->
            <image src="/images/drop_down.svg" style="transform: rotate({{showArrangement?0:-90}}deg);" class="icon">
            </image>
         </view>
      </view>

      <view qq:if="{{showArrangement}}">
         <button qq:if="{{owned}}" type="primary" bindtap="rearrangeSeat">重排座位</button>
         
         <view qq:if="{{noArrangement}}">当前暂无座位。请添加学生后点击重排座位。</view>
         <view class="table">
            <movable-area scale-area style="width: 100%; height: {{arrangement.length*2.5+5}}rem;">
               <movable-view scale style="width: 100%" direction="horizontal">
                  <view class="tr">
                     <view style="padding: 40rpx;">
                        <view style="
                  background-color: snow;
                   border-radius: 15rpx; 
                   padding: 10rpx; 
                   width: 160rpx; 
                   text-align: center;">
                           讲台
                        </view>
                     </view>
                  </view>
                  <block qq:for="{{arrangement}}" qq:for-item="r" qq:for-index="i">
                     <view class="tr">
                        <block qq:for="{{r}}" qq:for-item="c" qq:for-index="j">
                           <view bindtap="confirmChangeData" data-column="{{j}}" data-row="{{i}}" class="td w-30 bd bg-g" qq:if="{{c!==null}}">
                              <view style="font-size: {{fontSizes[i][j]}}vw;">{{c}}</view>
                           </view>
                           <view bindtap="confirmChangeData" data-column="{{j}}" data-row="{{i}}" class="td w-30 bd bg-w" qq:else>
                              <view></view>
                           </view>
                           
                        </block>
                     </view>
                  </block>
               </movable-view>
            </movable-area>
         </view>
      </view>
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
          <input focus placeholder='{{confirmPlaceHolder}}' bindinput='setValue'/>
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
   <view class="function-block" qq:if="{{owned}}">
      <view bindtap="switch" data-key="showNameList" class="block-title">
         <view class="block-title-text">学生名单</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showNameList?0:-90}}deg);" class="icon">
            </image>
         </view>
      </view>
      <view qq:if="{{showNameList}}" class="name-list-block">
         <scroll-view scroll-y style="height: 700rpx;">
            <view class="tr">
               <view class="td w-50 bd">
                  姓名
               </view>
               <view class="td w-50 bd">
                  身高
               </view>
               <view class="td w-50"></view>
            </view>
            <block qq:for="{{students}}" qq:for-item="student">

               <view class="tr" qq:if="{{student!==null}}">
                  <view class="td w-50 bd bd">
                     <input disabled value="{{student.name}}" />
                  </view>
                  <view class="td w-50 bd">
                     <input disabled value="{{student.height}}" />
                  </view>
                  <view class="td w-50">
                     <button type="warn" data-studentid="{{student.id}}" bindtap="deleteStudent">删除</button>
                  </view>
               </view>
            </block>
         </scroll-view>

         <view class="add-student">
            <input class="input-student" bindinput="inputStudentName" placeholder="姓名" />
            <input class="input-student" bindinput="inputStudentHeight" placeholder="身高(可选)" />
            <button type="primary" bindtap="addStudent">添加单个学生</button>

            <button type="primary" bindtap="chooseNamelistFile">导入Excel名单</button>
            <text class="discription">
               请在Excel表格文件的第一列输入学生姓名，第二列输入学生身高。
               （请空出表格第一行，单位：厘米cm）
            </text>
            <view class="discription">
               请勿输入表头（即“姓名”和“身高”）
            </view>
         </view>


      </view>
   </view>

   <view qq:if="{{owned}}" class="function-block">
      <view bindtap="switch" data-key="showSeats" class="block-title">
         <view class="block-title-text">编辑座位</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showSeats?0:-90}}deg);" class="icon"></image>
         </view>
      </view>

      <view qq:if="{{showSeats}}">

         <view>
            <text class="discription">
               每个格子表示一个座位，点击可切换状态，蓝色表示有座位，白色表示无座位。
               修改后请点击保存座位，然后再重排座位。
            </text>
         </view>

         <view class="set-dimensions">
            <input bindinput="inputRow" type="number" maxlength="2" value="{{seats.length}}" class="input-dimension" />行
            <input bindinput="inputCol" type="number" maxlength="2" value="{{seats[0].length}}"
               class="input-dimension" />列
            <view style="padding: 1rem;"><button bindtap="setSeatDimensions" type="default"
                  style="padding: 10rpx;">设置长宽</button></view>
         </view>

         <view class="table">
            <movable-area scale-area style="width: 100%; height: {{seats.length*2.5+5}}rem">
               <movable-view scale style="width: 100%" direction="horizontal" x="">
                  <view class="tr">
                     <view style="padding: 20rpx;">
                        <view
                           style="background-color: snow; border-radius: 15rpx; padding: 10rpx; width: 160rpx; text-align: center;">
                           讲台
                        </view>
                     </view>
                  </view>
                  <block qq:for="{{seats}}" qq:for-item="r" qq:for-index="i">
                     <view class="tr">
                        <block qq:for="{{r}}" qq:for-item="c" qq:for-index="j">

                           <view class="td w-30 bd bg-b" data-i="{{i}}" data-j="{{j}}" bindtap="changeSeatState"
                              qq:if="{{c}}">
                              <view></view>
                           </view>
                           <view class="td w-30 bd bg-w" data-i="{{i}}" data-j="{{j}}" bindtap="changeSeatState" qq:else>
                              <view></view>
                           </view>
                        </block>
                     </view>
                  </block>
               </movable-view>
            </movable-area>
         </view>
         <button type="primary" bindtap="setSeat">保存座位</button>
      </view>
   </view>

   <view class="function-block">
      <view bindtap="switch" data-key="showShare" class="block-title">
         <view class="block-title-text">分享</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showShare?0:-90}}deg);" class="icon"></image>
         </view>
      </view>

      <view qq:if="{{showShare}}">
         <view class="discription">
            复制班级id后发生给别人，对方即可在易位小程序主页加入此班级，然后查看当前座位表。
         </view>
         <view class="class-id-block">
            <view style="flex:1">
               班级id
               <input value="{{classId}}" disabled style="background-color: rgb(235, 235, 235); width: 90%;" />
            </view>
            <button type="primary" bindtap="copyClassId"
               style="width: 3rem; display: flex; align-items: center; justify-content: center;">
               复制
            </button>
         </view>
         <view class="class-id-block">
         <view style="flex:1">
               座位排布数据
               <input value="{{arrangement}}" disabled style="background-color: rgb(235, 235, 235); width: 90%;" />
            </view>
            <button type="primary" bindtap="copyArrangement"
               style="width: 3rem; display: flex; align-items: center; justify-content: center;">
               复制
            </button>
         </view>
         <text class="discription">
         下载教程： 
        1.	在班级页面中点击分享分区，然后你会看到座位排布数据，点击右边的复制按钮。
        2.	新建空白表格文件，并在任意一个单元格粘贴内容。
        3.	选中当前单元格，在工具栏中寻找‘数据’分栏。
        4.	如使用Excel，请依次选择：分隔符号——逗号——常规；如使用WPS，点击‘逗号’即可。
        5.	修改并保存文件，座位表就导出成功了。
            </text>
      </view>
   </view>


   <view qq:if="{{owned}}" class="function-block">
      <view bindtap="switch" data-key="update" class="block-title">
         <view class="block-title-text">定时重排（暂未开发）</view>
         <view class="block-title-symbol">
            <image src="/images/drop_down.svg" style="transform: rotate({{showSeats?0:-90}}deg);" class="icon"></image>
         </view>
      </view>

      <view qq:if="{{update}}">
         <view class="discription">
            注意：在使用此功能之前，请确保消息通知是处于打开状态。（右上角更多-设置-消息通知）
         </view>
         <view class="discription">
            打开此功能后小程序将在下周一早上8：30发送通知。（通知是一次性的，如需下次提醒，请再次设置消息通知）
         </view>
         <view class="class-id-block">
            <button type="primary" bindtap="notice">
               确认订阅
            </button>
            <button type="warn" bindtap="cancelnotice">
               取消订阅
            </button>
            <button type="default" bindtap="opensetting">
               打开设置
            </button>
         </view>

      </view>
      
   </view>
</view>