function downloadUrl(url, filename) {
  // download file having dynamic extension given url of the file
  // if extension is not given in filename, extension is auto detected.
  let xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "blob";
  xhr.onload = function (e) {
    if (this.status == 200) {
      const blob = this.response;
      const a = document.createElement("a");
      document.body.appendChild(a);
      const blobUrl = window.URL.createObjectURL(blob);
      a.href = blobUrl;
      a.download = filename;
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      }, 0);
    }
  };
  xhr.send();
}
