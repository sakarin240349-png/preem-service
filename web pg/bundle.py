import os

def bundle():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    with open('style.css', 'r', encoding='utf-8') as f:
        css = f.read()
    with open('line-config.js', 'r', encoding='utf-8') as f:
        line_js = f.read()
    with open('app.js', 'r', encoding='utf-8') as f:
        js = f.read()
    
    single = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
    single = single.replace('<script src="line-config.js"></script>', f'<script>\n{line_js}\n</script>')
    single = single.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')
    
    with open('single_file_index.html', 'w', encoding='utf-8') as f:
        f.write(single)
    print('single_file_index.html bundled successfully.')

if __name__ == '__main__':
    bundle()
