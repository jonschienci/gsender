package com.gsender.android;

import android.app.admin.DeviceAdminReceiver;

/** Device-owner enrollment is explicit over ADB; installation alone does not enroll. */
public final class KioskAdminReceiver extends DeviceAdminReceiver {}
