package com.zhaozehao.wanxiangguixing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 前台服务：让内置 HTTP 服务在浏览器切到前台后依然存活。
 *
 * 背景：APK 启动后立即把 Pico 浏览器拉到前台，壳应用退到后台；Android 的
 * 后台进程回收可能在长时间游玩时杀掉壳进程，导致 127.0.0.1:8898 服务消失、
 * 游戏中途加载失败。前台服务（带常驻通知）把进程优先级提升到"可见服务"，
 * 基本消除这个风险。
 */
public class KeepAliveService extends Service {
    static final String CHANNEL_ID = "wanxiangguixing_keepalive";
    static final int NOTIFICATION_ID = 1001;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                    NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "万象归形 运行中", NotificationManager.IMPORTANCE_MIN);
                    ch.setDescription("保持本地游戏服务运行");
                    nm.createNotificationChannel(ch);
                }
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
            b.setContentTitle("万象归形")
             .setContentText("本地服务运行中，可回到浏览器继续游戏")
             .setSmallIcon(android.R.drawable.ic_media_play)
             .setOngoing(true);
            startForeground(NOTIFICATION_ID, b.build());
        } catch (Exception e) {
            // 通知权限不可用等场景：退化为普通服务，不影响游戏
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
