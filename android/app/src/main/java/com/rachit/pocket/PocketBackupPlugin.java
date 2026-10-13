package com.rachit.pocket;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PocketBackup")
public class PocketBackupPlugin extends Plugin {
    @PluginMethod
    public void openBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "openBackupResult");
    }

    @ActivityCallback
    private void openBackupResult(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            response.put("data", JSONObject.NULL);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("Android did not return a backup file.");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) {
                call.reject("Pocket could not open the selected file.");
                return;
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (output.size() + read > 5 * 1024 * 1024) {
                    call.reject("The selected backup is larger than 5 MB.");
                    return;
                }
                output.write(buffer, 0, read);
            }
            response.put("data", output.toString(StandardCharsets.UTF_8.name()));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Pocket could not read the selected backup.", error);
        }
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        String fileName = call.getString("fileName");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType", "application/json");
        if (fileName == null || data == null) {
            call.reject("The backup file name or data is missing.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "saveBackupResult");
    }

    @ActivityCallback
    private void saveBackupResult(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            response.put("saved", false);
            call.resolve(response);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("Android did not return a location for the backup.");
            return;
        }

        String data = call.getString("data");
        if (data == null) {
            call.reject("The backup data is missing.");
            return;
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) {
                call.reject("Android could not open the selected backup location.");
                return;
            }
            output.write(data.getBytes(StandardCharsets.UTF_8));
            output.flush();
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Pocket could not write the backup file.", error);
        }
    }
}
