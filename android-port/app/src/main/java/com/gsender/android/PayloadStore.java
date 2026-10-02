package com.gsender.android;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.zip.*;

/** Update only runtime files. User data and the compile cache are sibling directories. */
final class PayloadStore {
    interface Archive { InputStream open() throws IOException; }
    private final File target, staging, previous;
    PayloadStore(File files) {
        target = new File(files, "runtime"); staging = new File(files, "runtime.staging");
        previous = new File(files, "runtime.previous");
    }
    File prepare(String hash, Archive archive) throws Exception {
        if (!hash.matches("[a-f0-9]{64}")) throw new IOException("Invalid payload identity");
        // Recover an interrupted directory swap before examining the installed marker.
        if (!target.exists() && previous.exists() && !previous.renameTo(target)) throw new IOException("Cannot recover previous runtime");
        File marker = new File(target, ".version");
        if (marker.isFile() && new String(Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8).trim().equals(hash)) {
            remove(staging); remove(previous); return target;
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[65536];
        try (InputStream input = archive.open()) { int n; while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n); }
        StringBuilder actual = new StringBuilder(); for (byte b : digest.digest()) actual.append(String.format("%02x", b & 255));
        if (!hash.equals(actual.toString())) throw new IOException("Payload checksum mismatch");
        remove(staging);
        if (!staging.mkdirs()) throw new IOException("Cannot prepare runtime staging directory");
        try {
            String prefix = staging.getCanonicalPath() + File.separator;
            try (ZipInputStream zip = new ZipInputStream(archive.open())) {
                ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    File output = new File(staging, entry.getName());
                    if (!output.getCanonicalPath().startsWith(prefix)) throw new IOException("Invalid payload path");
                    if (entry.isDirectory()) { if (!output.mkdirs() && !output.isDirectory()) throw new IOException("Cannot create directory"); continue; }
                    if (!output.getParentFile().mkdirs() && !output.getParentFile().isDirectory()) throw new IOException("Cannot create parent");
                    try (OutputStream out = new FileOutputStream(output)) { int n; while ((n=zip.read(buffer)) != -1) out.write(buffer,0,n); }
                }
            }
            for (String name : new String[]{"bootstrap.cjs", "server.cjs", "app/index.html", "pendant/index.html"})
                if (!new File(staging,name).isFile()) throw new IOException("Incomplete runtime: " + name);
            Files.write(new File(staging,".version").toPath(), hash.getBytes(StandardCharsets.UTF_8));
            remove(previous);
            if (target.exists() && !target.renameTo(previous)) throw new IOException("Cannot retain previous runtime");
            if (!staging.renameTo(target)) {
                if (previous.exists() && !previous.renameTo(target)) throw new IOException("Runtime activation failed; recovery needed");
                throw new IOException("Cannot activate prepared runtime");
            }
            // Keep the backup until the next successful prepare; a crash during activation remains recoverable.
            return target;
        } catch (Exception e) { remove(staging); throw e; }
    }
    private static void remove(File file) throws IOException {
        if (!file.exists()) return;
        File[] children=file.listFiles(); if (children!=null) for(File child:children) remove(child);
        if (!file.delete()) throw new IOException("Cannot remove " + file.getName());
    }
}
