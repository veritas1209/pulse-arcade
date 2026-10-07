from pathlib import Path
root=Path(__file__).resolve().parents[1]
scripts=root/'scripts'
source=(root.parent/'screw-harbor/scripts/deploy-pulse.py').read_text('utf8')
source=source.replace('screw-harbor','battleship').replace('.screw-manifest.json','.battleship-manifest.json')
source=source.replace("return run('python3 - <<", "return run(ROOT+'/venv/bin/python - <<")
source=source.replace("'penguin-extraction'} <= set(original_entries)","'penguin-extraction','screw-harbor'} <= set(original_entries)")
source=source.replace("if path != 'server/games.json' and not path.startswith", "if path not in ('server/games.json','server/app.py','server/battleship_rooms.py') and not path.startswith")
needle="    staged_hashes = tree_hash(stage)"
insert="""    app_source = sftp.file(baseline+'/server/app.py').read().decode('utf8')
    if 'setup_battleship' not in app_source:
        package_import = '    from .penguin_proxy import attach_penguin'
        plain_import = '    from penguin_proxy import attach_penguin'
        attach_point = "    app.router.add_get('/{file:.*}',static)"
        assert app_source.count(package_import)==1 and app_source.count(plain_import)==1 and app_source.count(attach_point)==1, 'Server integration context changed'
        app_source = app_source.replace(package_import, package_import+'\\n    from .battleship_rooms import setup_battleship')
        app_source = app_source.replace(plain_import, plain_import+'\\n    from battleship_rooms import setup_battleship')
        app_source = app_source.replace(attach_point, "    if 'battleship' in games: setup_battleship(app, origin=origin)\\n"+attach_point)
    if 'setup_battleship' not in sftp.file(baseline+'/server/app.py').read().decode('utf8'):
        restored=app_source.replace('\\n    from .battleship_rooms import setup_battleship','').replace('\\n    from battleship_rooms import setup_battleship','').replace("    if 'battleship' in games: setup_battleship(app, origin=origin)\\n",'')
        assert restored==sftp.file(baseline+'/server/app.py').read().decode('utf8'), 'Integration touched unrelated server code'
    write_remote(stage+'/server/app.py',app_source)
    sftp.put(str(PROJECT/'server/battleship_rooms.py'),stage+'/server/battleship_rooms.py')
    print(remote_python('import py_compile; py_compile.compile('+repr(stage+'/server/app.py')+',doraise=True); py_compile.compile('+repr(stage+'/server/battleship_rooms.py')+',doraise=True); print("Backend compiled")'),flush=True)
"""
assert needle in source
source=source.replace(needle,insert+needle)
source=source.replace("    for path, digest in base_hashes.items():", "    assert staged_hashes['server/app.py']==hashlib.sha256(app_source.encode('utf8')).hexdigest()\n    assert staged_hashes['server/battleship_rooms.py']==hashlib.sha256((PROJECT/'server/battleship_rooms.py').read_bytes()).hexdigest()\n    for path, digest in base_hashes.items():")
source=source.replace("    run('kill -TERM '+str(preview_pid))", "    print(remote_python((PROJECT/'scripts/remote-room-smoke.py').read_text('utf8')),flush=True)\n    run('kill -TERM '+str(preview_pid))",1)
(scripts/'deploy-pulse.py').write_text(source,'utf8')
source=(root.parent/'screw-harbor/scripts/prepare-pulse.mjs').read_text('utf8')
source=source.replace('screw-harbor','battleship').replace('SCREW HARBOR','Battleship').replace('스크루 하버','배틀쉽').replace('나사를 뽑아 구조물을 해체하세요.','함대를 숨기고 적 해역을 포격하세요.').replace("genre: '퍼즐'","genre: '전략'").replace("players: '1인'","players: '1~2인'").replace("['배틀쉽', '나사 퍼즐', 'screw harbor']","['배틀쉽', '함대', '해전', 'battleship']")
(scripts/'prepare-pulse.mjs').write_text(source,'utf8')
print('Release scripts adapted; no remote mutations.')
