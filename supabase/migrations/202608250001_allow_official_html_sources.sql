-- Official programme pages can be attached as private HTML source evidence.
-- Keep the existing bucket private and preserve every previously allowed type.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'text/html')
where id = 'private-file-assets'
  and not ('text/html' = any(allowed_mime_types));
