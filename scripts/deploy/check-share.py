#!/usr/bin/env python3
"""Verify a Linux host CIFS mount before any production image build."""
import json
import os
import pathlib
import platform
import subprocess
import sys
import tempfile


def filesystem(target, fstab=False):
    command = ['findmnt', '--json', '--mountpoint', str(target), '--output', 'SOURCE,FSTYPE,TARGET']
    if fstab:
        command.append('--fstab')
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    if result.returncode == 1:
        return None
    if result.returncode:
        raise RuntimeError('findmnt failed; verify util-linux installation and mount configuration.')
    entries = json.loads(result.stdout).get('filesystems', [])
    if len(entries) != 1:
        raise RuntimeError('Expected exactly one mount entry.')
    return entries[0]


def verify(entry, target, share):
    if entry['fstype'] != 'cifs' or entry['source'].rstrip('/') != share.rstrip('/') or pathlib.Path(entry['target']).resolve() != target:
        raise RuntimeError('Mount source/type/target differs from the configured CIFS share; refusing to continue.')


def check(config, mode):
    if platform.system() != 'Linux':
        raise RuntimeError('Shared-storage deployment requires a Linux Docker host with findmnt and mount.cifs.')
    api = config['services']['api']
    share = api['environment'].get('CIFS_SHARE_PATH', '')
    if not share.startswith('//') or len(share.strip('/').split('/')) < 2:
        raise RuntimeError('Set CIFS_SHARE_PATH=//server/share in .env.')
    mounts = [v for v in api.get('volumes', []) if v.get('target') == '/app/shared-documents' and v.get('type') == 'bind']
    if len(mounts) != 1:
        raise RuntimeError('Exactly one host bind mount for evidence is required.')
    target = pathlib.Path(mounts[0]['source']).resolve()
    if not target.is_dir() or target == pathlib.Path('/'):
        raise RuntimeError('Prepare a dedicated evidence mount directory first.')
    entry = filesystem(target)
    if entry is None:
        if mode != '--deploy':
            raise RuntimeError('Share is not mounted. Check-only mode does not mount; prepare fstab then use --deploy.')
        configured = filesystem(target, fstab=True)
        if configured is None:
            raise RuntimeError('Configure the exact CIFS mount in /etc/fstab first.')
        verify(configured, target, share)
        # No password in process arguments. fstab references a protected credentials file.
        command = ['mount', '--', str(target)]
        if os.geteuid() != 0:
            command = ['sudo', '-n', *command]
        result = subprocess.run(command, capture_output=True, timeout=45)
        if result.returncode:
            raise RuntimeError('Mount failed. Check fstab, credentials, network and noninteractive mount privileges.')
        entry = filesystem(target)
        if entry is None:
            raise RuntimeError('Mount command returned without the expected mounted filesystem.')
    verify(entry, target, share)
    if mode == '--deploy':
        # Temporary file lives on the verified share; remove only our own probe.
        with tempfile.NamedTemporaryFile(prefix='.preventive-pilot-probe-', dir=target) as probe:
            content = os.urandom(32)
            probe.write(content)
            probe.flush()
            os.fsync(probe.fileno())
            with open(probe.name, 'rb') as reader:
                if reader.read() != content:
                    raise RuntimeError('Shared-storage read-back did not match.')
        print('CIFS source verified; temporary write/read/delete probe passed.')
    else:
        print('CIFS source verified. Write/read probe is deferred to --deploy.')


if __name__ == '__main__':
    try:
        with open(sys.argv[1]) as source:
            check(json.load(source), sys.argv[2])
    except Exception as error:
        # Avoid raw command output which may contain mount options or credentials.
        print(str(error) if isinstance(error, RuntimeError) else 'Shared-storage verification failed; inspect host access and configuration.', file=sys.stderr)
        sys.exit(1)
