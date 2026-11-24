// Chromium-only File System Access API members missing from TypeScript's DOM lib.
// https://developer.mozilla.org/docs/Web/API/File_System_API

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FilePickerOptions {
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  id?: string;
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads';
}

interface OpenFilePickerOptions extends FilePickerOptions {
  multiple?: boolean;
}

interface SaveFilePickerOptions extends FilePickerOptions {
  suggestedName?: string;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}
