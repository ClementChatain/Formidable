import pathlib
d = pathlib.Path(__file__).parent
js = "\n".join((d / f).read_text() for f in ["xlsx.js", "core.js", "views.js", "app.js"])
html = (d / "index.html").read_text().replace("/*CSS*/", (d / "style.css").read_text()).replace("/*JS*/", js.replace("</script", "<\\/script"))
(d.parent / "formidable.html").write_text(html)
print("formidable.html", len(html) // 1024, "Ko")
