package com.rachit.pocket;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "PocketData")
public class PocketDataPlugin extends Plugin {
    private static final class Database extends SQLiteOpenHelper {
        Database(PocketDataPlugin plugin) {
            super(plugin.getContext(), "pocket-data.db", null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE snapshots (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Future schema changes must migrate records rather than drop the table.
        }
    }

    @PluginMethod
    public void readSnapshot(PluginCall call) {
        try (Database helper = new Database(this);
             SQLiteDatabase db = helper.getReadableDatabase();
             Cursor cursor = db.rawQuery("SELECT payload FROM snapshots WHERE id = 1", null)) {
            JSObject result = new JSObject();
            result.put("data", cursor.moveToFirst() ? cursor.getString(0) : JSONObject.NULL);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Pocket could not read its local database.", error);
        }
    }

    @PluginMethod
    public void writeSnapshot(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.length() > 10 * 1024 * 1024) {
            call.reject("The Pocket data is missing or too large.");
            return;
        }
        try {
            JSONObject parsed = new JSONObject(data);
            if (!"Pocket".equals(parsed.optString("app")) || parsed.optInt("version") < 5) {
                call.reject("The Pocket data format is not supported.");
                return;
            }
            try (Database helper = new Database(this)) {
                SQLiteDatabase db = helper.getWritableDatabase();
                db.beginTransaction();
                try {
                    db.execSQL("INSERT OR REPLACE INTO snapshots (id, payload) VALUES (1, ?)", new Object[]{data});
                    db.setTransactionSuccessful();
                } finally {
                    db.endTransaction();
                }
            }
            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Pocket could not save its local database.", error);
        }
    }
}
